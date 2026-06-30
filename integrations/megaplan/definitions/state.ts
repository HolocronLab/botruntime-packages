import { type StateDefinition, z } from '@botpress/sdk'

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

export const states = { megaplanAuth }

export type StatePayload = z.infer<typeof megaplanAuthSchema>
