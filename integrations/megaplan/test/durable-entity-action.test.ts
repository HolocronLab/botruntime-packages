import { expect, test } from 'bun:test'
import {
  createNegotiationTask as createNegotiationTaskDefinition,
} from '../definitions/approval-actions'
import {
  addComment as addCommentDefinition,
} from '../definitions/comment-actions'
import {
  createContractorHuman as createContractorHumanDefinition,
} from '../definitions/contractor-actions'
import {
  createDeal as createDealDefinition,
} from '../definitions/deal-actions'
import {
  createTask as createTaskDefinition,
} from '../definitions/task-actions'
import { createNegotiationTask } from '../src/actions/approval'
import { addComment } from '../src/actions/comment'
import { createContractorHuman } from '../src/actions/contractor'
import { createDeal } from '../src/actions/deal'
import { createTask } from '../src/actions/task'

const entityAttributes = {
  'botruntime.durableOperation': 'v1',
  'botruntime.operationCheckpoint': 'v1',
  'botruntime.operationCheckpoint.maxEntries': '1',
  'botruntime.operationCheckpoint.maxValueBytes': '512',
  'botruntime.operationCheckpoint.maxBytes': '1024',
}

test('every Megaplan mutation routed through Integration Operations declares a durable contract', () => {
  for (const definition of [
    createContractorHumanDefinition,
    createDealDefinition,
    createTaskDefinition,
    addCommentDefinition,
  ]) {
    expect(definition.attributes).toEqual(entityAttributes)
  }
  expect(createNegotiationTaskDefinition.attributes).toEqual({
    'botruntime.durableOperation': 'v1',
    'botruntime.fileRefAdmission': 'schema-v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '2',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '2048',
  })
})

test('negotiation admission accepts only an opaque FileRef selector', () => {
  const input = {
    name: 'Согласовать претензию',
    responsibleId: 'E-1',
    approverIds: ['E-2'],
    dealIds: ['D-1'],
    materialName: 'claim.pdf',
    materialFile: { id: 'cases/1/claim.pdf' },
  }
  expect(createNegotiationTaskDefinition.input.schema.parse(input)).toEqual(input)
  expect(() => createNegotiationTaskDefinition.input.schema.parse({
    ...input,
    materialFile: {
      id: 'cases/1/claim.pdf',
      url: 'https://internal.example/v1/files/download',
    },
  })).toThrow()
  expect(() => createNegotiationTaskDefinition.input.schema.parse({
    ...input,
    materialFileId: 'cases/1/claim.pdf',
    materialFile: undefined,
  })).toThrow()
  expect(() => createNegotiationTaskDefinition.input.schema.parse({
    ...input,
    dealIds: undefined,
  })).toThrow()
  expect(() => createNegotiationTaskDefinition.input.schema.parse({
    ...input,
    materialSha256: 'a'.repeat(64),
  })).toThrow()
})

test('durable mutations cannot bypass Integration Operations through callAction', async () => {
  for (const action of [
    createContractorHuman,
    createDeal,
    createTask,
    addComment,
    createNegotiationTask,
  ]) {
    await expect(action({} as never)).rejects.toThrow(/startIntegrationOperation/i)
  }
})
