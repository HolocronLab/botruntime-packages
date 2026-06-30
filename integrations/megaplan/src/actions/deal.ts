import { Money, type Deal, type ProgramState } from '../types'
import type { DealOutput } from '../../definitions/deal-actions'
import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

function mapState(s: ProgramState | undefined): DealOutput['deal']['state'] {
  if (!s) {
    return undefined
  }
  return { id: s.id, name: s.name, type: s.type, isEntry: s.isEntry }
}

function mapDeal(d: Deal): DealOutput['deal'] {
  return {
    id: d.id,
    number: d.number,
    name: d.name,
    description: d.description,
    state: mapState(d.state),
    program: d.program ? { contentType: d.program.contentType, id: d.program.id } : undefined,
    contractor: d.contractor ? { contentType: d.contractor.contentType, id: d.contractor.id } : undefined,
    price: d.price ? { value: String(d.price.value), currency: d.price.currency } : undefined,
    possibleTransitions: (d.possibleTransitions ?? []).map((t) => {
      const tr = t as { id?: unknown; to?: { id?: unknown; name?: string; type?: string; isEntry?: boolean } }
      return {
        id: String(tr.id ?? ''),
        to: { id: String(tr.to?.id ?? ''), name: tr.to?.name, type: tr.to?.type, isEntry: tr.to?.isEntry },
      }
    }),
  }
}

export const createDeal: IntegrationProps['actions']['createDeal'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const deal = await api.createDeal({
      programId: input.programId,
      contractorId: input.contractorId,
      managerId: input.managerId,
      name: input.name,
      description: input.description,
      stateId: input.stateId,
      price: input.price ? new Money(input.price.value, input.price.currency) : undefined,
    })
    return { deal: mapDeal(deal) }
  })

export const getDeal: IntegrationProps['actions']['getDeal'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    return { deal: mapDeal(await api.getDeal(input.id)) }
  })

export const updateDealFields: IntegrationProps['actions']['updateDealFields'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const deal = await api.updateDealFields(input.id, {
      name: input.name,
      description: input.description,
      managerId: input.managerId,
      price: input.price ? new Money(input.price.value, input.price.currency) : undefined,
    })
    return { deal: mapDeal(deal) }
  })

export const moveDealStage: IntegrationProps['actions']['moveDealStage'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const { moved, deal } = await api.moveDealStage(input.dealId, input.toStateId)
    return { moved, state: mapState(deal.state) }
  })

export const listPrograms: IntegrationProps['actions']['listPrograms'] = async ({ ctx, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const programs = await api.listPrograms()
    return { programs: programs.map((p) => ({ id: p.id, name: p.name })) }
  })

export const programStates: IntegrationProps['actions']['programStates'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const states = await api.programStates(input.programId)
    return { states: states.map((s) => ({ id: s.id, name: s.name, type: s.type, isEntry: s.isEntry })) }
  })
