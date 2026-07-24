import { describe, expect, test } from 'bun:test'
import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'
import {
  handleDurableOperation,
  type DurableOperationRequest,
  type ExactFileRef,
} from '../src/durable-operation'
import { YadiskApiError } from '../src/yadisk-api'

const fileRef: ExactFileRef = {
  id: 'files/claim.pdf',
  size: 3,
  contentType: 'application/pdf',
  filename: 'claim.pdf',
  checksum: 'a'.repeat(64),
}

const request = (
  input: Record<string, unknown> = {
    path: 'lead-1/claim.pdf',
    fileRef,
    overwrite: true,
  },
): string => JSON.stringify({
  operationId: 'op-1',
  attempt: 1,
  action: 'uploadDocument',
  idempotencyKey: 'claim-1',
  input: input as DurableOperationRequest['input'],
  deadline: new Date(Date.now() + 60_000).toISOString(),
  cancelRequestedAt: null,
} satisfies DurableOperationRequest)

const logger = {
  forBot: () => ({
    info() {},
    warn() {},
    error() {},
    debug() {},
  }),
} as unknown as IntegrationLogger

const exactMeta = {
  path: 'disk:/Приложения/app/cases/lead-1/claim.pdf',
  publicUrl: '',
  size: fileRef.size,
  sha256: fileRef.checksum,
}

describe('native durable uploadDocument', () => {
  test('pipes the exact platform stream into one provider PUT and verifies size+sha256', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    let opens = 0
    let puts = 0
    let stats = 0
    const provider = {
      prepareUpload: async () => 'https://storage.example/put?sig=1',
      uploadStreamOnce: async (href: string, received: ReadableStream<Uint8Array>, opts: { size: number }) => {
        puts++
        expect(href).toBe('https://storage.example/put?sig=1')
        expect(received).toBe(stream)
        expect(opts.size).toBe(3)
      },
      stat: async () => {
        stats++
        if (stats === 1) throw new YadiskApiError(404, 'not found')
        return exactMeta
      },
    }
    const files = {
      downloadFileRef: async ({ fileRef: received }: { fileRef: ExactFileRef }) => {
        opens++
        expect(received).toEqual(fileRef)
        return { stream }
      },
    }

    const outcome = await handleDurableOperation(
      'execute',
      request(),
      { yadiskToken: 'secret', yadiskFolder: 'cases' },
      { provider, files },
      logger,
    )

    expect(outcome).toEqual({
      kind: 'succeeded',
      result: {
        diskPath: 'app:/cases/lead-1/claim.pdf',
        size: 3,
        checksum: fileRef.checksum,
      },
    })
    expect(opens).toBe(1)
    expect(puts).toBe(1)
    expect(stats).toBe(2)
  })

  test('never replays an ambiguous provider handoff and later reconcile only reads provider state', async () => {
    let puts = 0
    let opens = 0
    const unknownProvider = {
      prepareUpload: async () => 'https://storage.example/put',
      uploadStreamOnce: async () => {
        puts++
        throw new YadiskApiError(0, 'socket closed after request started')
      },
      stat: async () => ({
        ...exactMeta,
        size: 2,
        sha256: 'b'.repeat(64),
      }),
    }
    const files = {
      downloadFileRef: async () => {
        opens++
        return {
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]))
              controller.close()
            },
          }),
        }
      },
    }

    const first = await handleDurableOperation(
      'execute',
      request(),
      { yadiskToken: 'secret' },
      { provider: unknownProvider, files },
      logger,
    )
    expect(first).toMatchObject({
      kind: 'outcome_unknown',
      errorCode: 'provider_outcome_unknown',
    })
    expect(puts).toBe(1)
    expect(opens).toBe(1)

    const reconciled = await handleDurableOperation(
      'reconcile',
      request(),
      { yadiskToken: 'secret' },
      {
        provider: {
          ...unknownProvider,
          stat: async () => exactMeta,
        },
        files,
      },
      logger,
    )
    expect(reconciled.kind).toBe('succeeded')
    expect(puts).toBe(1)
    expect(opens).toBe(1)
  })

  test('returns retry_safe only when provider handoff has not started', async () => {
    let opens = 0
    let puts = 0
    const outcome = await handleDurableOperation(
      'execute',
      request(),
      { yadiskToken: 'secret' },
      {
        provider: {
          prepareUpload: async () => {
            throw new YadiskApiError(503, 'temporary')
          },
          uploadStreamOnce: async () => {
            puts++
          },
          stat: async () => {
            throw new YadiskApiError(404, 'not found')
          },
        },
        files: {
          downloadFileRef: async () => {
            opens++
            throw new Error('must not open')
          },
        },
      },
      logger,
    )
    expect(outcome).toEqual({ kind: 'retry_safe' })
    expect(opens).toBe(0)
    expect(puts).toBe(0)
  })

  test('composes host cancellation before provider handoff and remains retry_safe', async () => {
    const controller = new AbortController()
    let puts = 0
    let prepareSignal: AbortSignal | undefined
    const outcome = await handleDurableOperation(
      'execute',
      request(),
      { yadiskToken: 'secret' },
      {
        provider: {
          prepareUpload: async (_path, _overwrite, signal) => {
            prepareSignal = signal
            throw signal?.reason
          },
          uploadStreamOnce: async () => {
            puts++
          },
          stat: async () => {
            controller.abort(new Error('host cancelled operation'))
            throw new YadiskApiError(404, 'not found')
          },
        },
        files: {
          downloadFileRef: async () => {
            throw new Error('must not open')
          },
        },
      },
      logger,
      controller.signal,
    )

    expect(outcome).toEqual({ kind: 'retry_safe' })
    expect(prepareSignal?.aborted).toBe(true)
    expect(prepareSignal?.reason).toEqual(new Error('host cancelled operation'))
    expect(puts).toBe(0)
  })

  test('host cancellation after PUT starts remains outcome_unknown without replay', async () => {
    const controller = new AbortController()
    let puts = 0
    let stats = 0
    let prepareSignal: AbortSignal | undefined
    let fileRefSignal: AbortSignal | undefined
    let putSignal: AbortSignal | undefined
    let verificationSignal: AbortSignal | undefined
    const outcome = await handleDurableOperation(
      'execute',
      request(),
      { yadiskToken: 'secret' },
      {
        provider: {
          prepareUpload: async (_path, _overwrite, signal) => {
            prepareSignal = signal
            return 'https://storage.example/put'
          },
          uploadStreamOnce: async (_href, _stream, { signal }) => {
            puts++
            putSignal = signal
            controller.abort(new Error('caller disconnected'))
            signal?.throwIfAborted()
          },
          stat: async (_path, signal) => {
            stats++
            if (stats === 1) throw new YadiskApiError(404, 'not found')
            verificationSignal = signal
            throw signal?.reason
          },
        },
        files: {
          downloadFileRef: async ({ signal }) => {
            fileRefSignal = signal
            return {
              stream: new ReadableStream<Uint8Array>({
                start(streamController) {
                  streamController.enqueue(new Uint8Array([1, 2, 3]))
                  streamController.close()
                },
              }),
            }
          },
        },
      },
      logger,
      controller.signal,
    )

    expect(outcome).toMatchObject({
      kind: 'outcome_unknown',
      errorCode: 'provider_outcome_unknown',
    })
    expect(putSignal?.aborted).toBe(true)
    expect(putSignal?.reason).toEqual(new Error('caller disconnected'))
    expect(prepareSignal).toBe(putSignal)
    expect(fileRefSignal).toBe(putSignal)
    expect(verificationSignal).toBe(putSignal)
    expect(puts).toBe(1)
    expect(stats).toBe(2)
  })

  test('rejects inline/base64 payloads before any network access', async () => {
    let providerCalls = 0
    const outcome = await handleDurableOperation(
      'execute',
      request({
        path: 'lead-1/claim.pdf',
        fileRef,
        contentBase64: 'YQ==',
      }),
      { yadiskToken: 'secret' },
      {
        provider: {
          prepareUpload: async () => {
            providerCalls++
            return 'unused'
          },
          uploadStreamOnce: async () => {
            providerCalls++
          },
          stat: async () => {
            providerCalls++
            return exactMeta
          },
        },
        files: {
          downloadFileRef: async () => {
            providerCalls++
            throw new Error('unused')
          },
        },
      },
      logger,
    )
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'invalid_operation' })
    expect(providerCalls).toBe(0)
  })

  test('cancel cannot turn missing provider evidence into a false failure or success', async () => {
    let writes = 0
    const outcome = await handleDurableOperation(
      'cancel',
      request(),
      { yadiskToken: 'secret' },
      {
        provider: {
          prepareUpload: async () => {
            writes++
            return 'unused'
          },
          uploadStreamOnce: async () => {
            writes++
          },
          stat: async () => {
            throw new YadiskApiError(404, 'not found')
          },
        },
        files: {
          downloadFileRef: async () => {
            writes++
            throw new Error('unused')
          },
        },
      },
      logger,
    )
    expect(outcome).toMatchObject({
      kind: 'still_unknown',
      errorCode: 'provider_outcome_unknown',
    })
    expect(writes).toBe(0)
  })
})
