import { describe, expect, it, vi } from 'vitest'
import { EVAL_MANIFEST_SCHEMA_VERSION } from '@holocronlab/botruntime-evals'
import { fetchEvalManifestFile } from './eval-file-fetch'
import { loadEvalManifest } from './eval-manifest-loader'

const client = {
  config: {
    apiUrl: 'https://botruntime.ru',
    headers: {
      Authorization: 'Bearer runtime-secret',
      'x-bot-id': '23',
      'x-workspace-id': '2',
      'x-unrelated': 'must-not-forward',
    },
  },
}

describe('hosted eval manifest fetch', () => {
  it('forwards only client auth coordinates to same-origin file URLs', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchEvalManifestFile(
      'https://botruntime.ru/v1/files/file_1/content',
      client as never,
      fetchFn as never,
    )

    const calls = fetchFn.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    const headers = new Headers(calls[0]![1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer runtime-secret')
    expect(headers.get('x-bot-id')).toBe('23')
    expect(headers.get('x-workspace-id')).toBe('2')
    expect(headers.get('x-unrelated')).toBeNull()
  })

  it('never forwards platform credentials to external file URLs', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))

    await fetchEvalManifestFile('https://storage.example/file_1', client as never, fetchFn as never)

    const calls = fetchFn.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>
    const headers = new Headers(calls[0]![1]?.headers)
    expect([...headers]).toEqual([])
  })

  it('loads the exact file reference and verifies its content-addressed manifest id', async () => {
    const payload = {
      schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION,
      evals: [{ name: 'smoke', conversation: [{ user: 'hello' }] }],
    }
    const { createHash } = await import('node:crypto')
    const manifestId = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
    const getFile = vi.fn(async () => ({
      file: { id: 'file_1', url: 'https://storage.example/file_1' },
    }))
    const listFiles = vi.fn()
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...payload, manifestId }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    try {
      const loaded = await loadEvalManifest({ ...client, getFile, listFiles } as never, {
        fileId: 'file_1',
        manifestId,
      })
      expect(loaded.fileId).toBe(manifestId)
      expect(loaded.evals).toHaveLength(1)
      expect(getFile).toHaveBeenCalledWith({ id: 'file_1' })
      expect(listFiles).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it.each([
    {
      name: 'missing exact file',
      reference: { fileId: 'gone', manifestId: `sha256:${'a'.repeat(64)}` },
      getFile: vi.fn(async () => {
        throw { isApiError: true, code: 404, type: 'ResourceNotFound' }
      }),
      manifest: undefined,
      code: 'EVAL_MANIFEST_MISSING',
    },
    {
      name: 'unsupported schema',
      reference: { fileId: 'file_1', manifestId: `sha256:${'a'.repeat(64)}` },
      getFile: vi.fn(async () => ({
        file: { id: 'file_1', url: 'https://storage.example/file_1' },
      })),
      manifest: {
        schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION + 1,
        manifestId: `sha256:${'a'.repeat(64)}`,
        evals: [],
      },
      code: 'EVAL_MANIFEST_SCHEMA_INCOMPATIBLE',
    },
    {
      name: 'content hash mismatch',
      reference: { fileId: 'file_1', manifestId: `sha256:${'a'.repeat(64)}` },
      getFile: vi.fn(async () => ({
        file: { id: 'file_1', url: 'https://storage.example/file_1' },
      })),
      manifest: {
        schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION,
        manifestId: `sha256:${'a'.repeat(64)}`,
        evals: [],
      },
      code: 'EVAL_MANIFEST_HASH_MISMATCH',
    },
  ])('reports $code for $name', async ({ reference, getFile, manifest, code }) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 }),
      ) as unknown as typeof fetch
    try {
      await expect(
        loadEvalManifest({ ...client, getFile, listFiles: vi.fn() } as never, reference),
      ).rejects.toThrow(code)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('legacy discovery does not hide an incompatible schema behind a schemaVersion tag', async () => {
    const listFiles = vi.fn(async () => ({
      files: [{ id: 'legacy_file', url: 'https://storage.example/legacy_file' }],
    }))
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION + 1,
            manifestId: `sha256:${'a'.repeat(64)}`,
            evals: [],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch
    try {
      await expect(loadEvalManifest({ ...client, listFiles } as never)).rejects.toThrow(
        'EVAL_MANIFEST_SCHEMA_INCOMPATIBLE',
      )
      expect(listFiles).toHaveBeenCalledWith({
        tags: { source: 'adk', type: 'eval-manifest' },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
