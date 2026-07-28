import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const searchContractors: IntegrationProps['actions']['searchContractors'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const found = await api.searchContractors(input.q, input.limit)
    return {
      contractors: found.map((c) => ({
        contentType: c.contentType,
        id: c.id,
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
    }
  })

export const createContractorHuman: IntegrationProps['actions']['createContractorHuman'] = async () => {
  throw new RuntimeError('createContractorHuman: используйте startIntegrationOperation')
}
