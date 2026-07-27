import chalk from 'chalk'
import type {
  BotDeployment,
  BotDeploymentPhase,
  CloudapiClient,
  DeploymentEnvironment,
} from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

const ABORTED_ERROR_CODE = 'BOT_DEPLOYMENT_ABORTED'
const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/
const DEPLOYMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEPLOYMENT_PHASES = new Set<BotDeploymentPhase>([
  'staged',
  'fenced',
  'draining',
  'transitioning',
  'schema_synced',
  'activated',
  'failed',
])

export type AbortBotDeploymentCommandDefinition =
  typeof commandDefinitions.bots.subcommands.deployments.subcommands.abort

type AbortTarget = {
  client: CloudapiClient
  workspaceId: string
  botId: string
}

type AbortResult = {
  botId: string
  workspaceId: string
  deploymentId: string
  phase: 'failed'
  lastErrorCode: typeof ABORTED_ERROR_CODE
  preservedVersionId: number
  abandonedVersionId: number
  fenceGeneration: number
}

export class AbortBotDeploymentCommand extends CloudCommand<AbortBotDeploymentCommandDefinition> {
  public async run(): Promise<void> {
    const target = await this._resolveTarget()
    const deploymentId = requireDeploymentId(this.argv.deploymentId)
    const before = await this._getDeployment(target, deploymentId)

    if (isAborted(before)) {
      this._printResult(target, before)
      return
    }
    if (before.schemaMutated || (before.phase !== 'staged' && before.phase !== 'fenced')) {
      throw new errors.BotpressCLIError(
        `deployment ${deploymentId} cannot be safely aborted: phase=${before.phase}, ` +
          `schemaMutated=${String(before.schemaMutated)}. The abort contract only permits ` +
          'pre-schema staged or fenced deployments.'
      )
    }

    const activeVersionNotice =
      before.expectedCurrentVersionId === 0
        ? 'No active version exists; '
        : `Active version ${before.expectedCurrentVersionId} will remain current; `
    const confirmed = await this.prompt.confirm(
      `Terminally abort deployment ${deploymentId} for bot ${target.botId}? ` +
        activeVersionNotice +
        `staged version ${before.stagedVersionId} will never activate.`
    )
    if (!confirmed) {
      this.logger.log('Deployment abort cancelled; no changes made.')
      return
    }

    // Read the volatile CAS token after the prompt. Operators may leave the
    // confirmation open, and an earlier recovery step may already have
    // unfenced traffic (deployment generation N, environment generation N+1).
    const currentEnvironment = await this._getEnvironment(target)
    if (currentEnvironment.currentVersionId !== before.expectedCurrentVersionId) {
      throw new errors.BotpressCLIError(
        `deployment ${deploymentId} cannot be safely aborted because the active version changed: ` +
          `expected ${before.expectedCurrentVersionId}, current ${currentEnvironment.currentVersionId}. ` +
          'Inspect the deployment before retrying.'
      )
    }

    const response = await target.client.abortBotDeployment({
      botId: target.botId,
      workspaceId: target.workspaceId,
      deploymentId,
      expectedFenceGeneration: currentEnvironment.fenceGeneration,
    })
    const after = parseDeployment(response?.deployment, deploymentId)
    assertExactAbort(before, currentEnvironment, after)
    this._printResult(target, after)
  }

  private async _resolveTarget(): Promise<AbortTarget> {
    const link = this.loadLinkIfPresent() ?? {}
    const botId = requirePositiveId('botId', this.requireBotId(link))
    const { name: profileName, profile } = await this.resolveProfile()
    const workspaceId = requirePositiveId('workspaceId', profile.workspaceId)
    const apiUrl = this.resolveApiUrl(profile, link)
    if (!profile.token) {
      throw new errors.BotpressCLIError(
        `profile "${profileName}" has no token — re-run \`brt login\` before recovering a deployment`
      )
    }
    return {
      client: this.machineCloudapiClient(profile, apiUrl),
      workspaceId,
      botId,
    }
  }

  private async _getDeployment(target: AbortTarget, deploymentId: string): Promise<BotDeployment> {
    const response = await target.client
      .getBotDeployment({
        botId: target.botId,
        workspaceId: target.workspaceId,
        deploymentId,
      })
      .catch((thrown) => {
        throw errors.BotpressCLIError.wrap(
          thrown,
          `could not inspect deployment ${deploymentId} for bot ${target.botId}`
        )
      })
    return parseDeployment(response?.deployment, deploymentId)
  }

  private async _getEnvironment(target: AbortTarget): Promise<DeploymentEnvironment> {
    const response = await target.client
      .getDeploymentEnvironment(target.botId, target.workspaceId)
      .catch((thrown) => {
        throw errors.BotpressCLIError.wrap(
          thrown,
          `could not inspect the deployment environment for bot ${target.botId}`
        )
      })
    return parseEnvironment(response?.environment)
  }

  private _printResult(target: AbortTarget, deployment: BotDeployment): void {
    const result = toAbortResult(target, deployment)
    if (this.argv.json) {
      this.logger.json(result)
      return
    }
    const preservedVersionNotice =
      result.preservedVersionId === 0
        ? 'no active version existed; '
        : `active version ${chalk.bold(String(result.preservedVersionId))} preserved; `
    this.logger.success(
      `Deployment ${chalk.bold(result.deploymentId)} for bot ${chalk.bold(result.botId)} aborted: ` +
        preservedVersionNotice +
        `staged version ${chalk.bold(String(result.abandonedVersionId))} abandoned; ` +
        `traffic unfenced at generation ${chalk.bold(String(result.fenceGeneration))}.`
    )
  }
}

function requirePositiveId(field: 'botId' | 'workspaceId', value: string): string {
  if (!POSITIVE_DECIMAL_ID.test(value)) {
    throw new errors.BotpressCLIError(`${field} must be a positive decimal ID`)
  }
  return value
}

function requireDeploymentId(value: string): string {
  if (!DEPLOYMENT_ID.test(value)) {
    throw new errors.BotpressCLIError('deploymentId must be a canonical UUID')
  }
  return value.toLowerCase()
}

function parseDeployment(value: unknown, expectedId: string): BotDeployment {
  if (!isRecord(value)) {
    throw new errors.BotpressCLIError('deployment response is malformed')
  }
  if (value.id !== expectedId) {
    throw new errors.BotpressCLIError('deployment response has an unexpected id')
  }
  if (typeof value.phase !== 'string' || !DEPLOYMENT_PHASES.has(value.phase as BotDeploymentPhase)) {
    throw new errors.BotpressCLIError('deployment response has an invalid phase')
  }
  if (value.transitionMode !== 'fence') {
    throw new errors.BotpressCLIError('deployment response has an unsupported transition mode')
  }
  if (
    !Number.isInteger(value.expectedCurrentVersionId) ||
    (value.expectedCurrentVersionId as number) < 0
  ) {
    throw new errors.BotpressCLIError('deployment response has an invalid expectedCurrentVersionId')
  }
  for (const field of ['stagedVersionId', 'finalVersionId'] as const) {
    if (!Number.isInteger(value[field]) || (value[field] as number) <= 0) {
      throw new errors.BotpressCLIError(`deployment response has an invalid ${field}`)
    }
  }
  if (
    value.fenceGeneration != null &&
    (!Number.isInteger(value.fenceGeneration) || (value.fenceGeneration as number) < 0)
  ) {
    throw new errors.BotpressCLIError('deployment response has an invalid fenceGeneration')
  }
  if (typeof value.schemaMutated !== 'boolean') {
    throw new errors.BotpressCLIError('deployment response has an invalid schemaMutated')
  }
  if (value.lastErrorCode !== undefined && typeof value.lastErrorCode !== 'string') {
    throw new errors.BotpressCLIError('deployment response has an invalid lastErrorCode')
  }
  return value as unknown as BotDeployment
}

function parseEnvironment(value: unknown): DeploymentEnvironment {
  if (!isRecord(value)) {
    throw new errors.BotpressCLIError('deployment environment response is malformed')
  }
  if (!Number.isInteger(value.currentVersionId) || (value.currentVersionId as number) < 0) {
    throw new errors.BotpressCLIError('deployment environment has an invalid currentVersionId')
  }
  if (!Number.isInteger(value.fenceGeneration) || (value.fenceGeneration as number) < 0) {
    throw new errors.BotpressCLIError('deployment environment has an invalid fenceGeneration')
  }
  if (typeof value.trafficFenced !== 'boolean') {
    throw new errors.BotpressCLIError('deployment environment has an invalid trafficFenced')
  }
  return value as unknown as DeploymentEnvironment
}

function isAborted(deployment: BotDeployment): boolean {
  return (
    deployment.phase === 'failed' &&
    deployment.lastErrorCode === ABORTED_ERROR_CODE &&
    deployment.schemaMutated === false
  )
}

function assertExactAbort(
  before: BotDeployment,
  environment: DeploymentEnvironment,
  after: BotDeployment
): asserts after is BotDeployment & {
  phase: 'failed'
  lastErrorCode: typeof ABORTED_ERROR_CODE
  fenceGeneration: number
} {
  const expectedFenceGeneration = environment.trafficFenced
    ? environment.fenceGeneration + 1
    : environment.fenceGeneration
  if (
    !isAborted(after) ||
    after.expectedCurrentVersionId !== before.expectedCurrentVersionId ||
    after.stagedVersionId !== before.stagedVersionId ||
    after.finalVersionId !== before.finalVersionId ||
    after.fenceGeneration !== expectedFenceGeneration
  ) {
    throw new errors.BotpressCLIError(
      `deployment ${before.id} abort did not return the exact aborted terminal state. ` +
        'Inspect the deployment and rerun this idempotent command if necessary.'
    )
  }
}

function toAbortResult(target: AbortTarget, deployment: BotDeployment): AbortResult {
  if (!isAborted(deployment) || deployment.fenceGeneration == null) {
    throw new errors.BotpressCLIError(
      `deployment ${deployment.id} did not return the exact aborted terminal state`
    )
  }
  return {
    botId: target.botId,
    workspaceId: target.workspaceId,
    deploymentId: deployment.id,
    phase: 'failed',
    lastErrorCode: ABORTED_ERROR_CODE,
    preservedVersionId: deployment.expectedCurrentVersionId,
    abandonedVersionId: deployment.stagedVersionId,
    fenceGeneration: deployment.fenceGeneration,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
