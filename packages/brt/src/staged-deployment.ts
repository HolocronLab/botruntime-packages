import { createHash } from 'node:crypto'

import * as errors from './errors'
import type {
  BotDeployment,
  BotDeploymentDrain,
  CloudapiClient,
  DeploymentEnvironment,
  StagedTableDeclaration,
} from './api/cloudapi-client'

const TRANSITION_MODE = 'fence' as const

export interface StagedDeploymentInput {
  botId: string
  workspaceId: string
  name: string
  code: string
  contentHash: string
  definition: Record<string, unknown>
  tables: StagedTableDeclaration[]
  tableContractChanged: boolean
  stateCodecDigest: string
}

export interface DeploymentIdentity {
  deploymentId: string
  idempotencyKey: string
}

export interface StagedDeploymentClient {
  getDeploymentEnvironment(
    botId: string,
    workspaceId: string
  ): ReturnType<CloudapiClient['getDeploymentEnvironment']>
  bootstrapDeploymentEnvironment(
    input: Parameters<CloudapiClient['bootstrapDeploymentEnvironment']>[0]
  ): ReturnType<CloudapiClient['bootstrapDeploymentEnvironment']>
  enforceDeploymentEnvironment(
    botId: string,
    workspaceId: string
  ): ReturnType<CloudapiClient['enforceDeploymentEnvironment']>
  getBotDeployment(
    input: Parameters<CloudapiClient['getBotDeployment']>[0]
  ): ReturnType<CloudapiClient['getBotDeployment']>
  stageBotDeployment(
    input: Parameters<CloudapiClient['stageBotDeployment']>[0]
  ): ReturnType<CloudapiClient['stageBotDeployment']>
  setBotDeploymentFence(
    input: Parameters<CloudapiClient['setBotDeploymentFence']>[0]
  ): ReturnType<CloudapiClient['setBotDeploymentFence']>
  getBotDeploymentDrain(
    input: Parameters<CloudapiClient['getBotDeploymentDrain']>[0]
  ): ReturnType<CloudapiClient['getBotDeploymentDrain']>
  syncBotDeploymentSchema(
    input: Parameters<CloudapiClient['syncBotDeploymentSchema']>[0]
  ): ReturnType<CloudapiClient['syncBotDeploymentSchema']>
  activateBotDeployment(
    input: Parameters<CloudapiClient['activateBotDeployment']>[0]
  ): ReturnType<CloudapiClient['activateBotDeployment']>
}

export interface StagedDeploymentDeps {
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  observationTimeoutMs?: number
  pollIntervalMs?: number
  log?: (line: string) => void
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`
}

export function stateCodecDigest(manifest: Record<string, unknown>): string {
  const primitives = { ...((manifest.primitives as Record<string, unknown> | undefined) ?? {}) }
  delete primitives.tables
  return createHash('sha256')
    .update(
      canonical({
        protocol: 2,
        transitionMode: TRANSITION_MODE,
        schemaVersion: manifest.schemaVersion,
        agent: manifest.agent,
        primitives,
      })
    )
    .digest('hex')
}

export function deploymentIdentity(input: StagedDeploymentInput): DeploymentIdentity {
  const digest = createHash('sha256')
    .update(
      canonical({
        protocol: 1,
        botId: input.botId,
        workspaceId: input.workspaceId,
        name: input.name,
        contentHash: input.contentHash,
        definition: input.definition,
        tables: input.tables,
        stateCodecDigest: input.stateCodecDigest,
      })
    )
    .digest()
  // RFC 4122 variant + deterministic v5-shaped identifier. The namespace is
  // already part of the hashed payload, so no ambient machine state is used.
  digest[6] = (digest[6]! & 0x0f) | 0x50
  digest[8] = (digest[8]! & 0x3f) | 0x80
  const hex = digest.subarray(0, 16).toString('hex')
  const deploymentId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20, 32)}`
  return {
    deploymentId,
    idempotencyKey: `brt-staged-${digest.toString('hex').slice(0, 48)}`,
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof errors.HTTPError && error.status === 404
}

function formatDrain(drain: BotDeploymentDrain): string {
  const counts = Object.entries(drain.counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ')
  const ids = drain.unitIds.slice(0, 16).join(', ')
  return `${counts || 'nonterminal units present'}${ids ? `; units: ${ids}` : ''}`
}

async function enforcedEnvironment(
  client: StagedDeploymentClient,
  input: StagedDeploymentInput
): Promise<DeploymentEnvironment | undefined> {
  let environment: DeploymentEnvironment
  try {
    ;({ environment } = await client.getDeploymentEnvironment(input.botId, input.workspaceId))
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  if (environment.enforcementState === 'legacy' || environment.enforcementState === 'contract_unknown') {
    if (environment.currentContentHash !== input.contentHash) {
      throw new errors.BotpressCLIError(
        'safe deployment adoption requires the local bundle to match the currently active bundle exactly; ' +
          `active=${environment.currentContentHash}, local=${input.contentHash}. ` +
          'Check out and deploy the active revision once to adopt it before changing code or table contracts.'
      )
    }
    ;({ environment } = await client.bootstrapDeploymentEnvironment({
      botId: input.botId,
      workspaceId: input.workspaceId,
      stateCodecDigest: input.stateCodecDigest,
      expectedCurrentContentHash: input.contentHash,
    }))
  }
  if (environment.enforcementState === 'ready') {
    ;({ environment } = await client.enforceDeploymentEnvironment(input.botId, input.workspaceId))
  }
  if (environment.enforcementState !== 'enforced') {
    throw new errors.BotpressCLIError(
      `deployment contract adoption is incomplete: ${canonical(environment.readiness)}`
    )
  }
  return environment
}

export async function runStagedDeployment(
  client: StagedDeploymentClient,
  input: StagedDeploymentInput,
  deps: StagedDeploymentDeps = {}
): Promise<BotDeployment> {
  const identity = deploymentIdentity(input)
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const deadline = now() + (deps.observationTimeoutMs ?? 60_000)
  const pollInterval = deps.pollIntervalMs ?? 1_000
  const log = deps.log ?? (() => undefined)
  const scoped = {
    botId: input.botId,
    workspaceId: input.workspaceId,
    deploymentId: identity.deploymentId,
  }

  let deployment: BotDeployment | undefined
  try {
    ;({ deployment } = await client.getBotDeployment(scoped))
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  if (deployment?.phase === 'activated') {
    if (deployment.transitionMode !== TRANSITION_MODE) {
      throw new errors.BotpressCLIError(
        `deployment ${deployment.id} uses unsupported transition mode ${String(
          deployment.transitionMode
        )}`
      )
    }
    log(`deployment ${deployment.id}: already activated`)
    return deployment
  }
  if (deployment && deployment.transitionMode !== TRANSITION_MODE) {
    throw new errors.BotpressCLIError(
      `deployment ${deployment.id} uses unsupported transition mode ${String(
        deployment.transitionMode
      )}`
    )
  }

  let environment: DeploymentEnvironment | undefined
  if (!deployment) {
    environment = await enforcedEnvironment(client, input)
    ;({ deployment } = await client.stageBotDeployment({
      ...scoped,
      idempotencyKey: identity.idempotencyKey,
      transitionMode: TRANSITION_MODE,
      expectedCurrentVersionId: environment?.currentVersionId ?? 0,
      name: input.name,
      code: input.code,
      definition: input.definition,
      tables: input.tables,
      stateCodecDigest: input.stateCodecDigest,
    }))
    log(`deployment ${deployment.id}: staged version ${deployment.stagedVersionId}`)
  }

  if (!input.tableContractChanged && deployment.phase === 'staged') {
    ;({ deployment } = await client.activateBotDeployment(scoped))
    log(`deployment ${deployment.id}: activated without table mutation`)
    return deployment
  }

  if (deployment.phase === 'staged') {
    environment ??= (await client.getDeploymentEnvironment(input.botId, input.workspaceId)).environment
    ;({ deployment } = await client.setBotDeploymentFence({
      ...scoped,
      expectedFenceGeneration: environment.fenceGeneration,
      enabled: true,
    }))
    log(`deployment ${deployment.id}: traffic fenced at generation ${deployment.fenceGeneration}`)
  }

  if (deployment.phase === 'fenced' || deployment.phase === 'draining') {
    if (deployment.fenceGeneration === undefined) {
      throw new errors.BotpressCLIError('fenced deployment has no durable fence generation')
    }
    while (true) {
      const { drain } = await client.getBotDeploymentDrain({
        ...scoped,
        beforeVersionId: deployment.expectedCurrentVersionId,
        fenceGeneration: deployment.fenceGeneration,
      })
      if (drain.drained) break
      if (now() >= deadline) {
        throw new errors.BotpressCLIError(
          `deployment ${deployment.id} remains safely fenced; old executions did not drain: ${formatDrain(
            drain
          )}. Reconcile or terminally cancel those units, then rerun the same deploy to resume.`
        )
      }
      await sleep(pollInterval)
    }
    log(`deployment ${deployment.id}: old executions drained`)
  }

  while (deployment.phase === 'fenced' || deployment.phase === 'draining' || deployment.phase === 'transitioning') {
    ;({ deployment } = await client.syncBotDeploymentSchema(scoped))
    if (deployment.phase === 'schema_synced') break
    if (now() >= deadline) {
      throw new errors.BotpressCLIError(
        `deployment ${deployment.id} remains safely fenced in phase ${deployment.phase}; ` +
          'rerun the same deploy to resume the durable schema transition.'
      )
    }
    await sleep(pollInterval)
  }

  if (deployment.phase === 'schema_synced') {
    ;({ deployment } = await client.activateBotDeployment(scoped))
    log(`deployment ${deployment.id}: activated`)
    return deployment
  }
  if (deployment.phase === 'activated') return deployment
  throw new errors.BotpressCLIError(
    `deployment ${deployment.id} stopped in unsupported durable phase ${deployment.phase}`
  )
}
