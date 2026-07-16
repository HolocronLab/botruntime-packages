import { describe, expect, test } from 'bun:test'
import { RuntimeError } from '@holocronlab/botruntime-sdk'
import { actions } from '../definitions/actions'
import definition from '../integration.definition'
import { clientFromConfig } from '../src/config'

describe('configuration', () => {
  test('apiToken обязателен и пробелы не считаются токеном', () => {
    for (const apiToken of [undefined, '', '   ']) {
      expect(() => clientFromConfig({ apiToken })).toThrow(RuntimeError)
    }
  })

  test('валидный токен принимается', () => {
    expect(() => clientFromConfig({ apiToken: ' token ' })).not.toThrow()
  })
})

describe('definition schema serialization', () => {
  test('объявляет точный egress-хост API и не включает inbound relay', () => {
    expect(definition.network).toEqual({
      providerHosts: ['api.xn----7sbarabva2auedgdkhac2adbeqt1tna3e.xn--p1ai'],
      ingressRelayed: false,
    })
  })

  test('все wire-схемы преобразуются в JSON Schema для brt publish', () => {
    const schemas: Array<[string, { toJSONSchema: () => unknown }]> = []
    if (definition.configuration?.schema) {
      schemas.push(['configuration', definition.configuration.schema])
    }
    for (const [name, action] of Object.entries(definition.actions ?? {})) {
      schemas.push([`action ${name} input`, action.input.schema])
      schemas.push([`action ${name} output`, action.output.schema])
    }

    for (const [name, schema] of schemas) {
      expect(() => schema.toJSONSchema(), name).not.toThrow()
    }
  })

  test('getAccount допускает nullable balance для free-тарифа', () => {
    expect(() =>
      actions.getAccount.output.schema.parse({
        name: 'Иван',
        email: 'ivan@example.test',
        blocked: false,
        balance: null,
        tariff: 'free',
        price: null,
        remainingRequests: 50,
        dailyLimit: 50,
      }),
    ).not.toThrow()
  })
})
