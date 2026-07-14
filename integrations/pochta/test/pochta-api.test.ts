import { describe, expect, test } from 'bun:test'

import { PochtaApiError, PochtaClient } from '../src/pochta-api'

const cfg = { login: 'api-user', password: 'super-secret', retryDelayMs: 0 }

const envelope = (records: string) => `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"
  xmlns:ns3="http://russianpost.org/operationhistory/data"
  xmlns:ns7="http://russianpost.org/operationhistory">
  <S:Body>
    <ns7:getOperationHistoryResponse>
      <ns3:OperationHistoryData>${records}</ns3:OperationHistoryData>
    </ns7:getOperationHistoryResponse>
  </S:Body>
</S:Envelope>`

const record = (type: number, attr: number, date: string, typeName: string, attrName: string) => `
<ns3:historyRecord>
  <ns3:OperationParameters>
    <ns3:OperType><ns3:Id>${type}</ns3:Id><ns3:Name>${typeName}</ns3:Name></ns3:OperType>
    <ns3:OperAttr><ns3:Id>${attr}</ns3:Id><ns3:Name>${attrName}</ns3:Name></ns3:OperAttr>
    <ns3:OperDate>${date}</ns3:OperDate>
  </ns3:OperationParameters>
</ns3:historyRecord>`

describe('PochtaClient', () => {
  test('verifies credentials on the official sample shipment before installation succeeds', async () => {
    const barcodes: string[] = []
    const client = new PochtaClient({
      ...cfg,
      fetchImpl: async (_input, init) => {
        const barcode = /<data:Barcode>([^<]+)<\/data:Barcode>/.exec(String(init?.body))?.[1]
        if (barcode) barcodes.push(barcode)
        return new Response(envelope(''))
      },
    })

    await client.verify()

    expect(barcodes).toEqual(['RA644000001RU'])
  })

  test('uses the official SOAP 1.2 endpoint and escapes credentials', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const client = new PochtaClient({
      ...cfg,
      login: 'api<&user',
      password: 'p<&word',
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return new Response(envelope(''), { headers: { 'content-type': 'application/soap+xml' } })
      },
    })

    const result = await client.track('RA644000001RU')

    expect(result.status).toBe('not_found')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://tracking.russianpost.ru/rtm34')
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe('application/soap+xml;charset=UTF-8')
    expect(String(calls[0]?.init.body)).toContain('<data:Barcode>RA644000001RU</data:Barcode>')
    expect(String(calls[0]?.init.body)).toContain('<data:login>api&lt;&amp;user</data:login>')
    expect(String(calls[0]?.init.body)).toContain('<data:password>p&lt;&amp;word</data:password>')
  })

  test('rejects a malformed tracking number before the network', async () => {
    let calls = 0
    const client = new PochtaClient({ ...cfg, fetchImpl: async () => { calls++; return new Response() } })

    await expect(client.track('wrong-track')).rejects.toThrow(/14 цифр|S10/)
    expect(calls).toBe(0)
  })

  test('classifies delivery by OperType=2 and returns the confirmed date', async () => {
    const client = new PochtaClient({
      ...cfg,
      fetchImpl: async () => new Response(envelope(
        record(1, 1, '2026-07-10T10:00:00.000+03:00', 'Приём', 'Единичный') +
        record(2, 1, '2026-07-13T14:20:00.000+03:00', 'Вручение', 'Адресату'),
      )),
    })

    const result = await client.track('RA644000001RU')

    expect(result.status).toBe('delivered')
    expect(result.deliveredAt).toBe('2026-07-13T11:20:00.000Z')
    expect(result.operations).toHaveLength(2)
    expect(result.lastOperation).toMatchObject({ typeCode: 2, attributeCode: 1, typeName: 'Вручение' })
  })

  test('classifies return by OperType=3 and keeps the operation audit', async () => {
    const client = new PochtaClient({
      ...cfg,
      fetchImpl: async () => new Response(envelope(
        record(3, 1, '2026-07-13T14:20:00.000+03:00', 'Возврат', 'Истёк срок хранения'),
      )),
    })

    const result = await client.track('12345678901234')

    expect(result.status).toBe('returned')
    expect(result.lastOperation).toMatchObject({ typeCode: 3, attributeName: 'Истёк срок хранения' })
  })

  test('retries a transient provider error and parses an in-transit history', async () => {
    let calls = 0
    const client = new PochtaClient({
      ...cfg,
      fetchImpl: async () => {
        calls++
        if (calls === 1) return new Response('temporary', { status: 503 })
        return new Response(envelope(record(8, 0, '2026-07-13T10:00:00.000+03:00', 'Обработка', 'Сортировка')))
      },
    })

    const result = await client.track('RA644000001RU')

    expect(calls).toBe(2)
    expect(result.status).toBe('in_transit')
  })

  test('SOAP fault is sanitized and never leaks the configured password', async () => {
    const fault = `<?xml version="1.0"?><S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body>
      <S:Fault><S:Reason><S:Text>Authorization failed for super-secret</S:Text></S:Reason></S:Fault>
    </S:Body></S:Envelope>`
    const client = new PochtaClient({ ...cfg, fetchImpl: async () => new Response(fault, { status: 500 }) })

    const error = await client.track('RA644000001RU').catch((value) => value)

    expect(error).toBeInstanceOf(PochtaApiError)
    expect(String(error)).not.toContain('super-secret')
    expect(String(error)).toContain('SOAP Fault')
  })
})
