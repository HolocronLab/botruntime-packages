// Тесты слоя actions: ошибки контракта должны всплывать до записи в Диск или
// возвращения пустых ссылок вызывающему.
import { describe, expect, test } from 'bun:test'
import type { IntegrationLogger } from '@botpress/sdk'
import { getLink, uploadDocument } from '../src/actions'

const logs: string[] = []
const logger = { forBot: () => ({ info(msg: string) { logs.push(msg) }, warn(msg: string) { logs.push(msg) } }) } as unknown as IntegrationLogger
const cfg = { yadiskToken: 't', yadiskFolder: 'cases' }

describe('uploadDocument: источник байтов', () => {
  test('и fileUrl, и contentBase64 → fail-loud (без сети)', async () => {
    await expect(
      uploadDocument(cfg, { path: 'x.pdf', fileUrl: 'https://u', contentBase64: 'YQ==' }, logger),
    ).rejects.toThrow(/ровно один/)
  })

  test('ни fileUrl, ни contentBase64 → fail-loud (без сети)', async () => {
    await expect(uploadDocument(cfg, { path: 'x.pdf' }, logger)).rejects.toThrow(/ровно один/)
  })

  test('битый contentBase64 → fail-loud до upload', async () => {
    await expect(uploadDocument(cfg, { path: 'x.pdf', contentBase64: 'not-base64' }, logger)).rejects.toThrow(/base64/)
  })

  test('абсолютный путь не обходит yadiskFolder', async () => {
    await expect(uploadDocument(cfg, { path: 'app:/outside/x.pdf', contentBase64: 'YQ==' }, logger)).rejects.toThrow(/относительный/)
  })
})

describe('getLink', () => {
  test('publish без public_url → fail-loud, без пути в warning', async () => {
    const originalFetch = globalThis.fetch
    logs.length = 0
    globalThis.fetch = (async (url: any, init?: any) => {
      const u = String(url)
      if (init?.method === 'PUT' && u.includes('/resources/publish?')) {
        return new Response('{}', { status: 200 })
      }
      if (init?.method === 'GET' && u.includes('/resources?')) {
        return new Response(JSON.stringify({ path: 'disk:/Приложения/app/cases/x.pdf' }), { status: 200 })
      }
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 })
    }) as typeof fetch
    try {
      await expect(getLink(cfg, 'x.pdf', logger)).rejects.toThrow(/публичную ссылку/)
      expect(logs.join('\n')).not.toContain('x.pdf')
      expect(logs.join('\n')).not.toContain('disk:/')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
