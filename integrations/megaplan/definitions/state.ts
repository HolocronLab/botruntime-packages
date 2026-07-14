import { type StateDefinition, z } from '@holocronlab/botruntime-sdk'

// megaplanAuth — cross-invocation cache of the OAuth access token (mirrors the Go
// client's in-memory cache; on our per-invocation runtime, integration state is the
// durable equivalent). Re-issued only on 401.
const megaplanAuthSchema = z.object({
  accessToken: z.string().nullable().title('Access Token').describe('Кэш токена password-grant; перевыпуск по 401'),
})

const megaplanAuth: StateDefinition = {
  type: 'integration',
  schema: megaplanAuthSchema,
}

const approvalOperationSchema = z.object({
  claimId: z.string().min(1),
  operationMarker: z.string().min(1),
  status: z.enum(['claimed', 'completed']),
  taskId: z.string().optional(),
  itemId: z.string().optional(),
  versionId: z.string().optional(),
})

// One state identity per integration installation. getOrSetState is the atomic
// claim; operationMarker stays in the payload so unrelated approval requests
// cannot bypass the same installation-wide creation lock.
const approvalOperation: StateDefinition = {
  type: 'integration',
  schema: approvalOperationSchema,
}

export const states = { megaplanAuth, approvalOperation }

export type MegaplanAuthStatePayload = z.infer<typeof megaplanAuthSchema>
export type ApprovalOperationStatePayload = z.infer<typeof approvalOperationSchema>
