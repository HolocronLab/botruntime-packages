import { expect, test } from 'bun:test'
import type {
  IntegrationLogger,
  OperationCheckpointClient,
  OperationCheckpointSnapshot,
} from '@holocronlab/botruntime-sdk'
import {
  handleDurableEntityOperation,
  type DurableEntityOperationDependencies,
  type DurableEntityOperationRequest,
} from '../src/entity-operation'
import { ApiError } from '../src/types'

const encoder = new TextEncoder()
const logger = {
  forBot: () => ({ info: () => undefined }),
} as unknown as IntegrationLogger

type CheckpointHarness = {
  client: OperationCheckpointClient
  appends: Array<{ key: string; value: string }>
  entries: () => Record<string, string>
}

const checkpoint = (
  initial: Record<string, string> = {},
  rejectKey?: string,
): CheckpointHarness => {
  let snapshot: OperationCheckpointSnapshot = {
    version: '1',
    revision: Object.keys(initial).length,
    entries: { ...initial },
  }
  const appends: Array<{ key: string; value: string }> = []
  const client: OperationCheckpointClient = {
    get revision() {
      return snapshot.revision
    },
    get entries() {
      return snapshot.entries
    },
    async append(key, value) {
      appends.push({ key, value })
      if (key === rejectKey) {
        throw Object.assign(new Error('checkpoint transport failed'), {
          status: 409,
          code: 'OPERATION_LEASE_LOST',
        })
      }
      if (snapshot.entries[key] !== undefined && snapshot.entries[key] !== value) {
        throw new Error('checkpoint key conflict')
      }
      if (snapshot.entries[key] === undefined) {
        snapshot = {
          version: '1',
          revision: snapshot.revision + 1,
          entries: { ...snapshot.entries, [key]: value },
        }
      }
      return snapshot
    },
  }
  return {
    client,
    appends,
    entries: () => ({ ...snapshot.entries }),
  }
}

const request = (
  action: DurableEntityOperationRequest['action'],
  input: DurableEntityOperationRequest['input'],
  checkpointClient: OperationCheckpointClient,
  overrides: Partial<DurableEntityOperationRequest> = {},
): DurableEntityOperationRequest => ({
  operationId: `op-${action}-42`,
  attempt: 1,
  action,
  idempotencyKey: `case:${action}:42`,
  input,
  deadline: new Date(Date.now() + 60_000).toISOString(),
  cancelRequestedAt: null,
  checkpoint: checkpointClient,
  ...overrides,
})

type ProviderState = {
  creates: string[]
  lookups: string[]
  comments: string[]
  uploads: string[]
  contractor?: Record<string, unknown>
  deal?: Record<string, unknown>
  task?: Record<string, unknown>
  comment?: Record<string, unknown>
}

const state = (): ProviderState => ({
  creates: [],
  lookups: [],
  comments: [],
  uploads: [],
})

const markerOf = (value: string | undefined): string | undefined =>
  value?.match(/BF-OP-[0-9a-f]{24}/)?.[0]

const dependencies = (
  observed: ProviderState,
  overrides: Partial<DurableEntityOperationDependencies['provider']> = {},
): DurableEntityOperationDependencies => ({
  provider: {
    async getContractorHuman(id) {
      observed.lookups.push(`contractor-id:${id}`)
      return observed.contractor as never
    },
    async getDeal(id) {
      observed.lookups.push(`deal-id:${id}`)
      return observed.deal as never
    },
    async getTask(id) {
      observed.lookups.push(`task-id:${id}`)
      return observed.task as never
    },
    async findContractorHumanByMarker(marker) {
      observed.lookups.push(`contractor:${marker}`)
      return observed.contractor?.lastName?.toString().includes(`[${marker}]`)
        && observed.contractor?.description?.toString().includes(marker)
        ? observed.contractor as never
        : undefined
    },
    async createContractorHuman(input) {
      observed.creates.push('contractor')
      observed.contractor = {
        contentType: 'ContractorHuman',
        id: 'C-42',
        ...input,
      }
      return observed.contractor as never
    },
    async findDealByMarker(marker) {
      observed.lookups.push(`deal:${marker}`)
      return observed.deal?.name?.toString().includes(`[${marker}]`)
        && observed.deal?.description?.toString().includes(marker)
        ? observed.deal as never
        : undefined
    },
    async createDeal(input) {
      observed.creates.push('deal')
      observed.deal = {
        contentType: 'Deal',
        id: 'D-42',
        number: '42',
        ...input,
      }
      return observed.deal as never
    },
    async findTaskByMarker(marker, isNegotiation) {
      observed.lookups.push(`task:${String(isNegotiation)}:${marker}`)
      return observed.task?.name?.toString().includes(`[${marker}]`)
        ? observed.task as never
        : undefined
    },
    async createTask(input) {
      observed.creates.push('task')
      observed.task = {
        contentType: 'Task',
        id: 'T-42',
        status: 'assigned',
        ...input,
      }
      return observed.task as never
    },
    async createNegotiationTask(input) {
      observed.creates.push('negotiation')
      observed.task = {
        contentType: 'Task',
        id: 'N-42',
        status: 'assigned',
        isNegotiation: true,
        ...input,
        negotiationItems: [{
          id: 'I-42',
          actualVersion: { id: 'V-42' },
        }],
      }
      return observed.task as never
    },
    async findCommentByMarker(_owner, _ownerId, marker) {
      observed.lookups.push(`comment:${marker}`)
      return observed.comment?.content?.toString().includes(marker)
        ? observed.comment as never
        : undefined
    },
    async addComment(_owner, _ownerId, content) {
      observed.comments.push(content)
      observed.comment = {
        contentType: 'Comment',
        id: 'M-42',
        content,
        attaches: [],
      }
      return observed.comment as never
    },
    async uploadFileStreamOnce(name, stream) {
      observed.uploads.push(`${name}:${await new Response(stream).text()}`)
      return { contentType: 'File', id: 'F-42' }
    },
    ...overrides,
  },
})

test('createContractorHuman crosses the provider boundary once and checkpoints its id', async () => {
  const cp = checkpoint()
  const observed = state()
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createContractorHuman',
      {
        firstName: 'Иван',
        description: 'Клиент',
        contactInfo: [{ type: 'phone', value: '+79990000000' }],
      },
      cp.client,
    ),
    dependencies(observed),
    logger,
  )

  expect(outcome).toEqual({ kind: 'succeeded', result: { id: 'C-42' } })
  expect(observed.creates).toEqual(['contractor'])
  expect(observed.contractor?.lastName).toContain('BF-OP-')
  expect(observed.contractor?.description).toContain('BF-OP-')
  expect(cp.entries()).toEqual({ entity: 'C-42' })
})

test('an ambiguous createDeal POST is recovered by marker without a duplicate', async () => {
  const cp = checkpoint()
  const observed = state()
  const deps = dependencies(observed, {
    async createDeal(input) {
      observed.creates.push('deal')
      observed.deal = {
        contentType: 'Deal',
        id: 'D-recovered',
        number: '77',
        ...input,
      }
      throw new ApiError(0, [{ message: 'connection dropped after commit' }], true)
    },
  })
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createDeal',
      {
        programId: 'P-1',
        name: 'Новое дело',
        description: 'Карточка',
      },
      cp.client,
    ),
    deps,
    logger,
  )

  expect(outcome).toMatchObject({
    kind: 'succeeded',
    result: { deal: { id: 'D-recovered', number: '77' } },
  })
  expect(observed.creates).toEqual(['deal'])
  expect(cp.entries()).toEqual({ entity: 'D-recovered' })
})

test('an ambiguous createTask stays unknown and reconcile performs only reads', async () => {
  const cp = checkpoint()
  const observed = state()
  const deps = dependencies(observed, {
    async createTask(input) {
      observed.creates.push('task')
      const marker = markerOf(input.name)
      expect(marker).toBeDefined()
      throw new ApiError(0, [{ message: 'connection dropped' }], true)
    },
  })
  const op = request(
    'createTask',
    {
      name: 'Проверить документы',
      responsibleId: 'E-1',
      dealIds: ['D-1'],
    },
    cp.client,
  )
  const executed = await handleDurableEntityOperation(
    'execute',
    op,
    deps,
    logger,
  )
  expect(executed).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'MEGAPLAN_OPERATION_OUTCOME_UNKNOWN',
  })
  expect(observed.creates).toHaveLength(1)

  const reconciled = await handleDurableEntityOperation(
    'reconcile',
    { ...op, attempt: 2 },
    deps,
    logger,
  )
  expect(reconciled).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_OPERATION_STILL_UNKNOWN',
  })
  expect(observed.creates).toHaveLength(1)
  expect(observed.lookups.filter((item) => item.startsWith('task:'))).toHaveLength(3)
})

test('addComment reconcile recovers the exact marker and never posts', async () => {
  const cp = checkpoint()
  const observed = state()
  let requestedMarker = ''
  const deps = dependencies(observed, {
    async findCommentByMarker(_owner, _ownerId, marker) {
      requestedMarker = marker
      observed.lookups.push(`comment:${marker}`)
      return {
        contentType: 'Comment',
        id: 'M-existing',
        content: marker,
        attaches: [],
      }
    },
  })
  const outcome = await handleDurableEntityOperation(
    'reconcile',
    request(
      'addComment',
      {
        owner: 'deal',
        ownerId: 'D-1',
        contentHtml: '<p>Аудит</p>',
      },
      cp.client,
      { attempt: 2 },
    ),
    deps,
    logger,
  )
  expect(outcome).toEqual({
    kind: 'succeeded',
    result: { id: 'M-existing' },
  })
  expect(requestedMarker).toMatch(/^BF-OP-/)
  expect(observed.comments).toHaveLength(0)
  expect(cp.entries()).toEqual({ entity: 'M-existing' })
})

test('negotiation streams one immutable FileRef and checkpoints file before task', async () => {
  const cp = checkpoint()
  const observed = state()
  const ref = {
    version: '1' as const,
    id: 'cases/1/claim.pdf',
    generation: 'generation-1',
    size: 5,
    contentType: 'application/pdf',
    filename: 'claim.pdf',
    checksum: `sha256:${'a'.repeat(64)}` as const,
  }
  const deps = dependencies(observed)
  deps.files = {
    async openRef(received) {
      expect(received).toEqual(ref)
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('claim'))
          controller.close()
        },
      })
    },
    async statRef(received) {
      return {
        size: received.size,
        checksum: received.checksum,
        contentType: received.contentType,
      }
    },
  }
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createNegotiationTask',
      {
        name: 'Согласовать претензию',
        responsibleId: 'E-1',
        approverIds: ['E-2'],
        dealIds: ['D-1'],
        materialName: 'claim.pdf',
        materialFile: ref,
      },
      cp.client,
    ),
    deps,
    logger,
  )

  expect(outcome).toEqual({
    kind: 'succeeded',
    result: {
      taskId: 'N-42',
      itemId: 'I-42',
      versionId: 'V-42',
    },
  })
  expect(observed.uploads).toEqual(['claim.pdf:claim'])
  expect(observed.creates).toEqual(['negotiation'])
  expect(observed.task?.materialSha256).toBe('a'.repeat(64))
  expect(cp.appends).toEqual([
    { key: 'file', value: 'F-42' },
    { key: 'entity', value: 'N-42' },
  ])
})

test('an ambiguous negotiation upload is never repeated by reconcile', async () => {
  const cp = checkpoint()
  const observed = state()
  const deps = dependencies(observed, {
    async uploadFileStreamOnce() {
      observed.uploads.push('claim.pdf:dispatched')
      throw new ApiError(0, [{ message: 'connection dropped after upload' }], true)
    },
  })
  deps.files = {
    async openRef() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('claim'))
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
  }
  const op = request(
    'createNegotiationTask',
    {
      name: 'Согласовать претензию',
      responsibleId: 'E-1',
      approverIds: ['E-2'],
      dealIds: ['D-1'],
      materialName: 'claim.pdf',
      materialFile: {
        version: '1',
        id: 'cases/1/claim.pdf',
        generation: 'generation-1',
        size: 5,
        contentType: 'application/pdf',
        filename: 'claim.pdf',
        checksum: `sha256:${'a'.repeat(64)}`,
      },
    },
    cp.client,
  )
  const executed = await handleDurableEntityOperation(
    'execute',
    op,
    deps,
    logger,
  )
  expect(executed).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'MEGAPLAN_NEGOTIATION_FILE_OUTCOME_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)
  expect(observed.creates).toHaveLength(0)

  const reconciled = await handleDurableEntityOperation(
    'reconcile',
    { ...op, attempt: 2 },
    deps,
    logger,
  )
  expect(reconciled).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_NEGOTIATION_FILE_STILL_UNKNOWN',
  })
  expect(observed.uploads).toHaveLength(1)
  expect(observed.creates).toHaveLength(0)
})

test('caller URLs and caller-authored checksums fail before I/O', async () => {
  const cp = checkpoint()
  const observed = state()
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createNegotiationTask',
      {
        name: 'Согласовать претензию',
        responsibleId: 'E-1',
        approverIds: ['E-2'],
        dealIds: [],
        materialName: 'claim.pdf',
        materialFile: {
          version: '1',
          id: 'cases/1/claim.pdf',
          generation: 'generation-1',
          size: 5,
          checksum: `sha256:${'b'.repeat(64)}`,
          url: 'https://internal.example/v1/files/download',
        },
        materialSha256: 'a'.repeat(64),
      } as never,
      cp.client,
    ),
    dependencies(observed),
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'failed',
    errorCode: 'INVALID_OPERATION',
  })
  expect(observed.uploads).toHaveLength(0)
  expect(observed.creates).toHaveLength(0)
  expect(observed.lookups).toHaveLength(0)
})

test('checkpoint failure after a confirmed create is outcome_unknown', async () => {
  const cp = checkpoint({}, 'entity')
  const observed = state()
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createContractorHuman',
      {
        firstName: 'Иван',
        contactInfo: [],
      },
      cp.client,
    ),
    dependencies(observed),
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.creates).toEqual(['contractor'])
})

test('a permanent provider rejection is failed and never reconciled as success', async () => {
  const cp = checkpoint()
  const observed = state()
  const deps = dependencies(observed, {
    async createContractorHuman() {
      observed.creates.push('contractor')
      throw new ApiError(422, [{ field: 'firstName', message: 'invalid' }], true)
    },
  })
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createContractorHuman',
      {
        firstName: 'Иван',
        contactInfo: [],
      },
      cp.client,
    ),
    deps,
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'failed',
    errorCode: 'MEGAPLAN_OPERATION_REJECTED',
  })
  expect(observed.creates).toHaveLength(1)
  expect(cp.appends).toHaveLength(0)
})

test('a checkpointed deal is verified by exact id and never recreated', async () => {
  const cp = checkpoint({ entity: 'D-42' })
  const observed = state()
  observed.deal = {
    contentType: 'Deal',
    id: 'D-42',
    number: '42',
    name: 'Дело [BF-OP-placeholder]',
    description: 'Botruntime operation: [BF-OP-placeholder]',
  }
  const deps = dependencies(observed, {
    async getDeal(id) {
      expect(id).toBe('D-42')
      return observed.deal as never
    },
  })
  const op = request(
    'createDeal',
    {
      programId: 'P-1',
      name: 'Дело',
      description: 'Карточка',
    },
    cp.client,
  )
  const marker = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${op.action}:${op.operationId}`),
  )
  const expectedMarker = `BF-OP-${Array.from(
    new Uint8Array(marker),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('').slice(0, 24)}`
  observed.deal.name = `Дело [${expectedMarker}]`
  observed.deal.description = `Карточка\n\nBotruntime operation: [${expectedMarker}]`

  const outcome = await handleDurableEntityOperation(
    'execute',
    op,
    deps,
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'succeeded',
    result: {
      deal: {
        id: 'D-42',
        name: 'Дело',
        description: 'Карточка',
      },
    },
  })
  expect(observed.creates).toHaveLength(0)
  expect(observed.lookups.filter((item) => item.startsWith('deal:'))).toHaveLength(0)
})

test('checkpoint failure after marker recovery is outcome_unknown, never retry_safe', async () => {
  const cp = checkpoint({}, 'entity')
  const observed = state()
  const deps = dependencies(observed, {
    async findContractorHumanByMarker(marker) {
      return {
        contentType: 'ContractorHuman',
        id: 'C-existing',
        lastName: `Иванов [${marker}]`,
        description: `Botruntime operation: [${marker}]`,
      }
    },
  })
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createContractorHuman',
      {
        firstName: 'Иван',
        lastName: 'Иванов',
        contactInfo: [],
      },
      cp.client,
    ),
    deps,
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'OPERATION_CHECKPOINT_OUTCOME_UNKNOWN',
  })
  expect(observed.creates).toHaveLength(0)
})

test('a lost operation lease while opening FileRef is retry-safe before provider handoff', async () => {
  const cp = checkpoint()
  const observed = state()
  const deps = dependencies(observed)
  deps.files = {
    async openRef() {
      throw Object.assign(new Error('lease lost'), {
        status: 409,
        code: 'OPERATION_LEASE_LOST',
      })
    },
    async statRef() {
      throw new Error('not reached')
    },
  }
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createNegotiationTask',
      {
        name: 'Согласовать претензию',
        responsibleId: 'E-1',
        approverIds: ['E-2'],
        dealIds: [],
        materialName: 'claim.pdf',
        materialFile: {
          version: '1',
          id: 'cases/1/claim.pdf',
          generation: 'generation-1',
          size: 5,
          checksum: `sha256:${'a'.repeat(64)}`,
        },
      },
      cp.client,
    ),
    deps,
    logger,
  )
  expect(outcome).toEqual({ kind: 'retry_safe' })
  expect(observed.uploads).toHaveLength(0)
  expect(observed.creates).toHaveLength(0)
})

test('cancellation with a confirmed negotiation upload remains outcome_unknown', async () => {
  const cp = checkpoint({ file: 'F-confirmed' })
  const observed = state()
  const outcome = await handleDurableEntityOperation(
    'execute',
    request(
      'createNegotiationTask',
      {
        name: 'Согласовать претензию',
        responsibleId: 'E-1',
        approverIds: ['E-2'],
        dealIds: [],
        materialName: 'claim.pdf',
        materialFile: {
          version: '1',
          id: 'cases/1/claim.pdf',
          generation: 'generation-1',
          size: 5,
          checksum: `sha256:${'a'.repeat(64)}`,
        },
      },
      cp.client,
      { cancelRequestedAt: new Date().toISOString() },
    ),
    dependencies(observed),
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'outcome_unknown',
    errorCode: 'MEGAPLAN_OPERATION_CANCELLED_WITH_EFFECTS',
  })
  expect(observed.creates).toHaveLength(0)
  expect(observed.uploads).toHaveLength(0)
})

test('cancel without a checkpoint stays unknown when marker lookup cannot prove absence', async () => {
  const cp = checkpoint()
  const observed = state()
  const outcome = await handleDurableEntityOperation(
    'cancel',
    request(
      'createTask',
      {
        name: 'Проверить документы',
        responsibleId: 'E-1',
        dealIds: [],
      },
      cp.client,
      {
        attempt: 2,
        cancelRequestedAt: new Date().toISOString(),
      },
    ),
    dependencies(observed),
    logger,
  )
  expect(outcome).toMatchObject({
    kind: 'still_unknown',
    errorCode: 'MEGAPLAN_OPERATION_STILL_UNKNOWN',
  })
  expect(observed.creates).toHaveLength(0)
})
