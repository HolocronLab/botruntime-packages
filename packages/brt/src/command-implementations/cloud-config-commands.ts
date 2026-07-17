import type { CloudapiClient } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import { cloudInfo, isValidConfigVarName, readSecretValue } from '../cloud-io'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

// Bot configuration and secrets are deliberately different products:
// - config set|list|rm uses Botpress-wire bot.configuration.data (public,
//   schema-backed, read-only at runtime);
// - secret set uses the encrypted config-var store exposed as secrets/env.
// Values are read from stdin/--value-file, never argv, so secret values do not
// leak into shell history or the process list.

export type ConfigSetCommandDefinition = typeof commandDefinitions.config.subcommands.set
export class ConfigSetCommand extends CloudCommand<ConfigSetCommandDefinition> {
  public async run(): Promise<void> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      await setBotConfiguration(
        target.client,
        target.targetBotId,
        this.argv.name,
        this.argv.valueFile,
        target.workspaceId
      )
      return
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await setBotConfiguration(client, botId, this.argv.name, this.argv.valueFile, link.workspaceId)
  }
}

export type ConfigListCommandDefinition = typeof commandDefinitions.config.subcommands.list
export class ConfigListCommand extends CloudCommand<ConfigListCommandDefinition> {
  public async run(): Promise<void> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      return printBotConfiguration(await readBotConfiguration(target.client, target.targetBotId, target.workspaceId))
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    printBotConfiguration(await readBotConfiguration(client, botId, link.workspaceId))
  }
}

export type ConfigRmCommandDefinition = typeof commandDefinitions.config.subcommands.rm
export class ConfigRmCommand extends CloudCommand<ConfigRmCommandDefinition> {
  public async run(): Promise<void> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      await removeBotConfiguration(target.client, target.targetBotId, this.argv.name, target.workspaceId)
      return
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await removeBotConfiguration(client, botId, this.argv.name, link.workspaceId)
  }
}

export type SecretSetCommandDefinition = typeof commandDefinitions.secret.subcommands.set
export class SecretSetCommand extends CloudCommand<SecretSetCommandDefinition> {
  public async run(): Promise<void> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      await setSecretVar(
        target.client,
        target.targetBotId,
        this.argv.name,
        this.argv.valueFile,
        target.workspaceId
      )
      return
    }
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await setSecretVar(client, botId, this.argv.name, this.argv.valueFile)
  }
}

async function setSecretVar(
  client: CloudapiClient,
  botId: string,
  name: string,
  valueFile: string | undefined,
  workspaceId?: string
): Promise<void> {
  if (!isValidConfigVarName(name)) {
    throw new errors.BotpressCLIError(`invalid variable name "${name}" (want ^[A-Za-z_][A-Za-z0-9_]*$)`)
  }
  const value = await readSecretValue('value', valueFile)
  if (workspaceId) {
    await client.setWorkspaceConfigVar(workspaceId, botId, name, value)
  } else {
    await client.setConfigVar(botId, name, value)
  }
  cloudInfo(`secret ${name} -> ok`)
}

async function readBotConfiguration(
  client: CloudapiClient,
  botId: string,
  workspaceId?: string
): Promise<{
  id: string
  data: Record<string, unknown>
  schema: Record<string, unknown>
}> {
  const response = await client.getBotConfiguration(botId, workspaceId)
  return {
    id: response.bot.id,
    data: response.bot.configuration?.data ?? {},
    schema: response.bot.configuration?.schema ?? {},
  }
}

async function setBotConfiguration(
  client: CloudapiClient,
  botId: string,
  name: string,
  valueFile: string | undefined,
  workspaceId?: string
): Promise<void> {
  if (!isValidConfigVarName(name)) {
    throw new errors.BotpressCLIError(`invalid configuration name "${name}" (want ^[A-Za-z_][A-Za-z0-9_]*$)`)
  }
  const current = await readBotConfiguration(client, botId, workspaceId)
  const raw = await readSecretValue('value', valueFile)
  const value = parseConfigurationValue(name, raw, current.schema)
  const data = { ...current.data, [name]: value }
  await client.updateBotConfiguration(current.id, data, workspaceId)

  const persisted = await readBotConfiguration(client, current.id, workspaceId)
  if (!Object.hasOwn(persisted.data, name) || !sameValue(persisted.data[name], value)) {
    throw new errors.BotpressCLIError(`configuration write for "${name}" was not persisted`)
  }
  cloudInfo(`set ${name} -> ok`)
}

async function removeBotConfiguration(
  client: CloudapiClient,
  botId: string,
  name: string,
  workspaceId?: string
): Promise<void> {
  const current = await readBotConfiguration(client, botId, workspaceId)
  const data = { ...current.data }
  delete data[name]
  await client.updateBotConfiguration(current.id, data, workspaceId)

  const persisted = await readBotConfiguration(client, current.id, workspaceId)
  if (Object.hasOwn(persisted.data, name)) {
    throw new errors.BotpressCLIError(`configuration removal for "${name}" was not persisted`)
  }
  cloudInfo(`rm ${name} -> ok`)
}

function parseConfigurationValue(name: string, raw: string, schema: Record<string, unknown>): unknown {
  const properties = isRecord(schema.properties) ? schema.properties : undefined
  const field = properties && isRecord(properties[name]) ? properties[name] : undefined
  if (properties && !field) {
    throw new errors.BotpressCLIError(`configuration "${name}" is not declared in agent.config.ts`)
  }

  switch (field?.type) {
    case 'string':
      return raw
    case 'number': {
      const value = Number(raw)
      if (!Number.isFinite(value)) throw invalidValue(name, 'number')
      return value
    }
    case 'integer': {
      const value = Number(raw)
      if (!Number.isInteger(value)) throw invalidValue(name, 'integer')
      return value
    }
    case 'boolean':
      if (raw === 'true') return true
      if (raw === 'false') return false
      throw invalidValue(name, 'boolean')
    case 'object':
    case 'array': {
      try {
        const value: unknown = JSON.parse(raw)
        if (field.type === 'object' ? isRecord(value) : Array.isArray(value)) return value
      } catch {}
      throw invalidValue(name, field.type)
    }
    default:
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
  }
}

function invalidValue(name: string, type: string): errors.BotpressCLIError {
  return new errors.BotpressCLIError(`configuration "${name}" expects ${type}`)
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function printBotConfiguration(config: { data: Record<string, unknown> }): void {
  const entries = Object.entries(config.data).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) {
    cloudInfo('no configuration values')
    return
  }
  for (const [name, value] of entries) {
    process.stdout.write(`${name}\t${JSON.stringify(value)}\n`)
  }
}
