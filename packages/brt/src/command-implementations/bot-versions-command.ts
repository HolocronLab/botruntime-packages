import chalk from 'chalk'
import type { BotVersionEntry, CloudapiClient } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

// brt bots versions list|deploy (DEVLP-166) — what's live, and rollback in one
// command. Target resolution mirrors the canonical-link + --bot-id override
// pattern used by `brt logs`/`brt conversations` (CloudCommand.loadLink /
// requireBotId), but auth always uses the bot's own per-bot API key
// (botCloudapiClient) rather than the workspace profile PAT: cloudapi mounts
// GET/POST /v1/admin/bots/{id}/versions* bot-scoped only, with no
// workspace-PAT route (see cloudapi's routes_admin.go) — unlike logs, which
// has a dedicated workspace-scoped human route.

type BotVersionsDefinition =
  | typeof commandDefinitions.bots.subcommands.versions.subcommands.list
  | typeof commandDefinitions.bots.subcommands.versions.subcommands.deploy

abstract class BotVersionsCommand<C extends BotVersionsDefinition> extends CloudCommand<C> {
  protected async resolveBotVersionsTarget(): Promise<{ client: CloudapiClient; botId: string }> {
    // loadLinkIfPresent (not loadLink): --bot-id is a valid target on its own,
    // same as `brt logs` — requiring agent.json/bot.json to exist even when the
    // caller already gave an explicit id would fail commands that have
    // everything they need.
    const link = this.loadLinkIfPresent() ?? {}
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)
    return { client, botId }
  }
}

export type ListBotVersionsCommandDefinition = typeof commandDefinitions.bots.subcommands.versions.subcommands.list

export class ListBotVersionsCommand extends BotVersionsCommand<ListBotVersionsCommandDefinition> {
  public async run(): Promise<void> {
    const { client, botId } = await this.resolveBotVersionsTarget()
    const versions = await client
      .listBotVersions(botId)
      .then((res) => parseBotVersions(res))
      .catch((thrown) => {
        throw errors.BotpressCLIError.wrap(thrown, `could not list versions for bot ${botId}`)
      })

    if (this.argv.json) {
      this.logger.json(versions)
      return
    }

    if (versions.length === 0) {
      this.logger.log('No versions found.')
      return
    }
    for (const version of versions) {
      const marker = version.current ? chalk.green(' (current)') : ''
      this.logger.log(`${version.id}\t${version.createdAt}\t${version.name}${marker}`)
    }
  }
}

export type DeployBotVersionCommandDefinition = typeof commandDefinitions.bots.subcommands.versions.subcommands.deploy

export class DeployBotVersionCommand extends BotVersionsCommand<DeployBotVersionCommandDefinition> {
  public async run(): Promise<void> {
    const { client, botId } = await this.resolveBotVersionsTarget()
    const versionId = this.argv.versionId

    await client.deployBotVersion(botId, versionId).catch((thrown) => {
      throw errors.BotpressCLIError.wrap(thrown, `could not deploy version ${versionId} for bot ${botId}`)
    })

    const message = `Bot ${chalk.bold(botId)} is now running version ${chalk.bold(versionId)}`
    if (this.argv.json) {
      this.logger.json({ botId, current: versionId })
      return
    }
    this.logger.success(message)
  }
}

function parseBotVersions(value: unknown): BotVersionEntry[] {
  if (!isRecord(value) || !Array.isArray(value.versions)) {
    throw new errors.BotpressCLIError('bot versions response has malformed versions')
  }
  return value.versions.map((row, index) => parseBotVersionEntry(row, index))
}

function parseBotVersionEntry(value: unknown, index: number): BotVersionEntry {
  const prefix = `bot versions response row ${index}`
  if (!isRecord(value)) throw new errors.BotpressCLIError(`${prefix} is malformed`)
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new errors.BotpressCLIError(`${prefix}.id is malformed`)
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    throw new errors.BotpressCLIError(`${prefix}.name is malformed`)
  }
  if (typeof value.current !== 'boolean') {
    throw new errors.BotpressCLIError(`${prefix}.current is malformed`)
  }
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new errors.BotpressCLIError(`${prefix}.createdAt is malformed`)
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    throw new errors.BotpressCLIError(`${prefix}.description is malformed`)
  }
  return {
    id: value.id,
    name: value.name,
    current: value.current,
    createdAt: value.createdAt,
    ...(value.description !== undefined ? { description: value.description } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
