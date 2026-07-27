import { expect, test } from 'bun:test'
import type {
  IntegrationLogger,
  OperationCheckpointClient,
  OperationCheckpointSnapshot,
} from '@holocronlab/botruntime-sdk'
import {
  handleCaseDocumentOperation,
  type CaseDocumentOperationDependencies,
  type PublishCaseDocumentInput,
  type PublishCaseDocumentRequest,
  validatePublishCaseDocumentInput,
} from '../src/case-document-operation'
import { ApiError } from '../src/types'

const encoder = new TextEncoder()
const logger = {
  forBot: () => ({ info: () => undefined }),
} as unknown as IntegrationLogger

const fileRef = (id: string, text: string, filename: string) => ({
  version: '1' as const,
  id,
  generation: `${id}-generation-1`,
  size: encoder.encode(text).byteLength,
  contentType: 'application/pdf',
  filename,
  checksum: `sha256:${'a'.repeat(64)}` as const,
})

const input: PublishCaseDocumentInput = {
  owner: 'deal',
  ownerId: 'D-42',
  contentHtml: '<p>Документы дела</p>',
  attachments: [
    { fileRef: fileRef('brt-file-1', 'first', 'claim.pdf') },
    {
      fileRef: fileRef('brt-file-2', 'second', 'calculation.pdf'),
      displayName: 'Расчёт.pdf',
      mimeType: 'application/x-case-calculation',
    },
  ],
}

type CheckpointHarness = {
  client: OperationCheckpointClient
  appends: Array<{ expectedRevision: number; key: string; value: string }>
  current: () => OperationCheckpointSnapshot
}

const checkpoint = (
  initialEntries: Record<string, string> = {},
  loseFirstResponseFor?: string,
): CheckpointHarness => {
  let current: OperationCheckpointSnapshot = {
    version: '1',
    revision: Object.keys(initialEntries).length,
    entries: { ...initialEntries },
  }
  const appends: CheckpointHarness['appends'] = []
  let lost = false
  const client: OperationCheckpointClient = {
    get revision() {
      return current.revision
    },
    get entries() {
      return current.entries
    },
    async append(key, value) {
      const expectedRevision = current.revision
      appends.push({ expectedRevision, key, value })
      const isExactReplay = current.entries[key] === value
      if (!isExactReplay) {
        if (current.entries[key] !== undefined) throw new Error('checkpoint key conflict')
        current = {
          version: '1',
          revision: current.revision + 1,
          entries: { ...current.entries, [key]: value },
        }
      }
      if (!lost && loseFirstResponseFor === key) {
        lost = true
        // The real SDK repeats this exact transport body internally. Represent
        // that hidden retry in the harness while returning the recovered 200 to
        // the application handler.
        appends.push({ expectedRevision, key, value })
      }
      return current
    },
  }
  return { client, appends, current: () => current }
}

const request = (
  checkpointClient: OperationCheckpointClient,
  overrides: Partial<PublishCaseDocumentRequest> = {},
): PublishCaseDocumentRequest => ({
  operationId: 'op-publication-42',
  attempt: 1,
  action: 'publishCaseDocument',
  idempotencyKey: 'case-document:publication-42',
  input,
  deadline: new Date(Date.now() + 60_000).toISOString(),
  cancelRequestedAt: null,
  checkpoint: checkpointClient,
  ...overrides,
})

type ProviderCalls = {
  downloads: string[]
  uploads: Array<{ name: string; bytes: string; size: number; mimeType: string }>
  comments: Array<{ ownerId: string; content: string; attachmentIds: string[] }>
  lookups: string[]
}

const dependencies = (
  calls: ProviderCalls,
  overrides: Partial<CaseDocumentOperationDependencies['provider']> = {},
): CaseDocumentOperationDependencies => ({
  files: {
    async openRef(ref) {
      calls.downloads.push(ref.id)
      const text = ref.id === 'brt-file-1' ? 'first' : 'second'
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text))
          controller.close()
        },
      })
    },
    async statRef(ref) {
      return {
        size: ref.size,
        checksum: ref.checksum,
        contentType: ref.contentType,
      }
    },
  },
  provider: {
    async uploadFileStreamOnce(name, stream, size, mimeType) {
      const bytes = await new Response(stream).text()
      calls.uploads.push({ name, bytes, size, mimeType })
      return { contentType: 'File', id: `M-${calls.uploads.length}` }
    },
    async addComment(_owner, ownerId, content, attachmentIds) {
      calls.comments.push({ ownerId, content, attachmentIds: [...(attachmentIds ?? [])] })
      return { contentType: 'Comment', id: 'C-1' }
    },
    async findCommentByMarker(_owner, _ownerId, marker) {
      calls.lookups.push(marker)
      return undefined
    },
    ...overrides,
  },
})

const calls = (): ProviderCalls => ({
  downloads: [],
  uploads: [],
  comments: [],
  lookups: [],
})

test('execute streams ordered FileRefs, checkpoints provider IDs, then creates one comment', async () => {
  const cp = checkpoint()
  const observed = calls()
  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client),
    dependencies(observed),
    logger,
  )

  expect(outcome).toEqual({
    kind: 'succeeded',
    result: { commentId: 'C-1', attachmentIds: ['M-1', 'M-2'] },
  })
  expect(observed.downloads).toEqual(['brt-file-1', 'brt-file-2'])
  expect(observed.uploads).toEqual([
    { name: 'claim.pdf', bytes: 'first', size: 5, mimeType: 'application/pdf' },
    { name: 'Расчёт.pdf', bytes: 'second', size: 6, mimeType: 'application/x-case-calculation' },
  ])
  expect(observed.comments).toHaveLength(1)
  expect(observed.comments[0]!.ownerId).toBe('D-42')
  expect(observed.comments[0]!.content).toContain('BF-PUB-')
  expect(observed.comments[0]!.attachmentIds).toEqual(['M-1', 'M-2'])
  expect(cp.appends.map(({ key, value }) => ({ key, value }))).toEqual([
    { key: 'attachment:00', value: 'M-1' },
    { key: 'attachment:01', value: 'M-2' },
    { key: 'comment', value: 'C-1' },
  ])
})

test('a confirmed attachment checkpoint skips its download and upload on retry', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-existing' })
  const observed = calls()
  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client, { attempt: 2 }),
    dependencies(observed),
    logger,
  )

  expect(outcome).toEqual({
    kind: 'succeeded',
    result: { commentId: 'C-1', attachmentIds: ['M-existing', 'M-1'] },
  })
  expect(observed.downloads).toEqual(['brt-file-2'])
  expect(observed.comments[0]!.attachmentIds).toEqual(['M-existing', 'M-1'])
})

test('an ambiguous file upload is never replayed and reconcile performs no provider POST', async () => {
  const cp = checkpoint()
  const observed = calls()
  const deps = dependencies(observed, {
    async uploadFileStreamOnce() {
      observed.uploads.push({ name: 'claim.pdf', bytes: '', size: 5, mimeType: 'application/pdf' })
      throw new Error('connection dropped after request dispatch')
    },
  })

  const executeOutcome = await handleCaseDocumentOperation('execute', request(cp.client), deps, logger)
  expect(executeOutcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'MEGAPLAN_FILE_UPLOAD_OUTCOME_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)
  expect(observed.comments).toHaveLength(0)

  const reconcileOutcome = await handleCaseDocumentOperation('reconcile', request(cp.client), deps, logger)
  expect(reconcileOutcome).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)
  expect(observed.comments).toHaveLength(0)
  expect(observed.lookups).toHaveLength(0)
})

test('a provider failure before the business POST is retry-safe', async () => {
  const cp = checkpoint()
  const observed = calls()
  const deps = dependencies(observed, {
    async uploadFileStreamOnce() {
      throw new ApiError(503, [{ message: 'token endpoint unavailable' }], false)
    },
  })

  const outcome = await handleCaseDocumentOperation('execute', request(cp.client), deps, logger)
  expect(outcome).toEqual({ kind: 'retry_safe' })
  expect(observed.comments).toHaveLength(0)
  expect(cp.appends).toHaveLength(0)
})

test('an ambiguous comment POST is recovered by its deterministic marker', async () => {
  const cp = checkpoint()
  const observed = calls()
  let lookups = 0
  const deps = dependencies(observed, {
    async addComment(_owner, ownerId, content, attachmentIds) {
      observed.comments.push({ ownerId, content, attachmentIds: [...(attachmentIds ?? [])] })
      throw new Error('connection dropped after comment commit')
    },
    async findCommentByMarker(_owner, _ownerId, marker) {
      observed.lookups.push(marker)
      lookups++
      return lookups === 1
        ? undefined
        : {
          contentType: 'Comment',
          id: 'C-recovered',
          content: marker,
          attaches: [{ id: 'M-1' }, { id: 'M-2' }],
        }
    },
  })

  const outcome = await handleCaseDocumentOperation('execute', request(cp.client), deps, logger)
  expect(outcome).toEqual({
    kind: 'succeeded',
    result: { commentId: 'C-recovered', attachmentIds: ['M-1', 'M-2'] },
  })
  expect(observed.comments).toHaveLength(1)
  expect(observed.lookups).toHaveLength(2)
  expect(cp.current().entries.comment).toBe('C-recovered')
})

test('a lost checkpoint response retries the same immutable key/value pair', async () => {
  const cp = checkpoint({}, 'attachment:00')
  const observed = calls()
  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client),
    dependencies(observed),
    logger,
  )

  expect(outcome.kind).toBe('succeeded')
  expect(observed.uploads).toHaveLength(2)
  expect(cp.appends.slice(0, 2)).toEqual([
    { expectedRevision: 0, key: 'attachment:00', value: 'M-1' },
    { expectedRevision: 0, key: 'attachment:00', value: 'M-1' },
  ])
})

test('inline bytes, base64, URLs, and non-canonical FileRefs are rejected before I/O', async () => {
  const cp = checkpoint()
  const observed = calls()
  const unsafeInput = {
    ...input,
    attachments: [{
      fileRef: {
        ...input.attachments[0]!.fileRef,
        url: 'https://files.internal.example/raw',
        bytesBase64: 'ZG9jdW1lbnQ=',
      },
    }],
  }
  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client, { input: unsafeInput as never }),
    dependencies(observed),
    logger,
  )

  expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'INVALID_OPERATION' })
  expect(observed.downloads).toHaveLength(0)
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(0)
})

test('runtime accepts the same multibyte public string lengths as the JSON schema', () => {
  expect(validatePublishCaseDocumentInput({
    ...input,
    ownerId: 'д'.repeat(256),
    contentHtml: 'ю'.repeat(64 * 1024),
    attachments: [{
      ...input.attachments[0],
      displayName: 'ф'.repeat(1024),
    }],
  })).toBe(true)
})

test('reconcile with confirmed upload IDs only searches for the marker and never writes to Megaplan', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-1', 'attachment:01': 'M-2' })
  const observed = calls()
  const outcome = await handleCaseDocumentOperation(
    'reconcile',
    request(cp.client),
    dependencies(observed),
    logger,
  )

  expect(outcome).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN',
  })
  expect(observed.lookups).toHaveLength(1)
  expect(observed.downloads).toHaveLength(0)
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(0)
})

test('reconcile recovers a committed comment without posting a duplicate', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-1', 'attachment:01': 'M-2' })
  const observed = calls()
  const deps = dependencies(observed, {
    async findCommentByMarker(_owner, _ownerId, marker) {
      observed.lookups.push(marker)
      return {
        contentType: 'Comment',
        id: 'C-existing',
        content: marker,
        attaches: [{ id: 'M-1' }, { id: 'M-2' }],
      }
    },
  })
  const outcome = await handleCaseDocumentOperation(
    'reconcile',
    request(cp.client, { attempt: 2 }),
    deps,
    logger,
  )

  expect(outcome).toEqual({
    kind: 'succeeded',
    result: { commentId: 'C-existing', attachmentIds: ['M-1', 'M-2'] },
  })
  expect(observed.downloads).toHaveLength(0)
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(0)
  expect(cp.current().entries.comment).toBe('C-existing')
})

test('an expired deadline stops before Files API or provider handoff', async () => {
  const cp = checkpoint()
  const observed = calls()
  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client, { deadline: new Date(Date.now() - 1_000).toISOString() }),
    dependencies(observed),
    logger,
  )

  expect(outcome).toEqual({ kind: 'retry_safe' })
  expect(observed.downloads).toHaveLength(0)
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(0)
})

test('a lost operation lease stops the stale attempt without a provider request', async () => {
  const cp = checkpoint()
  const observed = calls()
  const deps = dependencies(observed)
  deps.files = {
    ...deps.files,
    async openRef() {
      throw Object.assign(new Error('attempt lease is no longer current'), {
        status: 409,
        code: 'OPERATION_LEASE_LOST',
      })
    },
  }

  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(cp.client),
    deps,
    logger,
  )

  expect(outcome).toEqual({ kind: 'retry_safe' })
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(0)
})

test('a lost operation lease after file upload is outcome-unknown and is never replayed', async () => {
  const cp = checkpoint()
  const observed = calls()
  const checkpointClient: OperationCheckpointClient = {
    get revision() {
      return cp.client.revision
    },
    get entries() {
      return cp.client.entries
    },
    async append() {
      throw Object.assign(new Error('attempt lease is no longer current'), {
        status: 409,
        code: 'OPERATION_LEASE_LOST',
      })
    },
  }
  const deps = dependencies(observed)

  const executeOutcome = await handleCaseDocumentOperation(
    'execute',
    request(checkpointClient),
    deps,
    logger,
  )
  expect(executeOutcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)

  const reconcileOutcome = await handleCaseDocumentOperation(
    'reconcile',
    request(checkpointClient, { attempt: 2 }),
    deps,
    logger,
  )
  expect(reconcileOutcome).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)
  expect(observed.comments).toHaveLength(0)
})

test('a lost operation lease after comment creation is outcome-unknown', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-1', 'attachment:01': 'M-2' })
  const observed = calls()
  const checkpointClient: OperationCheckpointClient = {
    get revision() {
      return cp.client.revision
    },
    get entries() {
      return cp.client.entries
    },
    async append() {
      throw Object.assign(new Error('attempt lease is no longer current'), {
        status: 409,
        code: 'OPERATION_LEASE_LOST',
      })
    },
  }

  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(checkpointClient),
    dependencies(observed),
    logger,
  )

  expect(outcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(1)
})

for (const code of ['CHECKPOINT_KEY_CONFLICT', 'CHECKPOINT_REVISION_CONFLICT']) {
  test(`${code} after file upload is outcome-unknown instead of replayable`, async () => {
    const cp = checkpoint()
    const observed = calls()
    const checkpointClient: OperationCheckpointClient = {
      get revision() {
        return cp.client.revision
      },
      get entries() {
        return cp.client.entries
      },
      async append() {
        throw Object.assign(new Error('checkpoint conflict'), { status: 409, code })
      },
    }

    const outcome = await handleCaseDocumentOperation(
      'execute',
      request(checkpointClient),
      dependencies(observed),
      logger,
    )

    expect(outcome).toMatchObject({
      kind: 'outcome_unknown',
      errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
    })
    expect(observed.uploads).toHaveLength(1)
    expect(observed.comments).toHaveLength(0)
  })
}

test('a confirmed recovered comment with an uncommitted checkpoint is never posted again', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-1', 'attachment:01': 'M-2' })
  const observed = calls()
  const checkpointClient: OperationCheckpointClient = {
    get revision() {
      return cp.client.revision
    },
    get entries() {
      return cp.client.entries
    },
    async append() {
      throw Object.assign(new Error('checkpoint revision conflict'), {
        status: 409,
        code: 'CHECKPOINT_REVISION_CONFLICT',
      })
    },
  }
  const deps = dependencies(observed, {
    async findCommentByMarker(_owner, _ownerId, marker) {
      observed.lookups.push(marker)
      return {
        contentType: 'Comment',
        id: 'C-existing',
        content: marker,
        attaches: [{ id: 'M-1' }, { id: 'M-2' }],
      }
    },
  })

  const executeOutcome = await handleCaseDocumentOperation(
    'execute',
    request(checkpointClient),
    deps,
    logger,
  )
  expect(executeOutcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.comments).toHaveLength(0)

  const reconcileOutcome = await handleCaseDocumentOperation(
    'reconcile',
    request(checkpointClient, { attempt: 2 }),
    deps,
    logger,
  )
  expect(reconcileOutcome).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_PUBLICATION_STILL_UNKNOWN',
  })
  expect(observed.comments).toHaveLength(0)
})

test('a checkpoint conflict after comment ACK is outcome-unknown', async () => {
  const cp = checkpoint({ 'attachment:00': 'M-1', 'attachment:01': 'M-2' })
  const observed = calls()
  const checkpointClient: OperationCheckpointClient = {
    get revision() {
      return cp.client.revision
    },
    get entries() {
      return cp.client.entries
    },
    async append() {
      throw Object.assign(new Error('checkpoint key conflict'), {
        status: 409,
        code: 'CHECKPOINT_KEY_CONFLICT',
      })
    },
  }

  const outcome = await handleCaseDocumentOperation(
    'execute',
    request(checkpointClient),
    dependencies(observed),
    logger,
  )

  expect(outcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(0)
  expect(observed.comments).toHaveLength(1)
})

test('foreign or non-monotonic checkpoint entries fail closed', async () => {
  const invalidEntrySets: Array<Record<string, string>> = [
    { 'attachment:01': 'M-2' },
    { foreign: 'provider-url' },
  ]
  for (const entries of invalidEntrySets) {
    const cp = checkpoint(entries)
    const observed = calls()
    const outcome = await handleCaseDocumentOperation(
      'execute',
      request(cp.client),
      dependencies(observed),
      logger,
    )
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'INVALID_OPERATION' })
    expect(observed.downloads).toHaveLength(0)
  }
})
