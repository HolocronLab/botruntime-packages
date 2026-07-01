import type { CloudapiClient } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import { cloudInfo, isValidConfigVarName, readSecretValue } from '../cloud-io'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

// brt config set|list|rm and brt secret set — per-bot config-vars on the bespoke
// cloudapi wire (env.X parity), ported from the (deleted) thin brt CLI's
// commands/config.ts. On the wire config and secret are identical (PUT
// /v1/admin/config-variables/{name} with {value}; everything is sealed
// server-side) — the only difference is client-side, which section of the bot's
// config the name documents. Values are read from stdin/--value-file, never
// argv, so they never leak into shell history or the process list.

export type ConfigSetCommandDefinition = typeof commandDefinitions.config.subcommands.set
export class ConfigSetCommand extends CloudCommand<ConfigSetCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await setConfigVar(client, botId, this.argv.name, this.argv.valueFile, 'set')
  }
}

export type ConfigListCommandDefinition = typeof commandDefinitions.config.subcommands.list
export class ConfigListCommand extends CloudCommand<ConfigListCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    const res = await client.listConfigVars(botId)
    if (res.variables.length === 0) {
      cloudInfo('no config variables')
      return
    }
    for (const v of res.variables) {
      process.stdout.write(`${v.name}${v.updatedAt ? `\t${v.updatedAt}` : ''}\n`)
    }
  }
}

export type ConfigRmCommandDefinition = typeof commandDefinitions.config.subcommands.rm
export class ConfigRmCommand extends CloudCommand<ConfigRmCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await client.deleteConfigVar(botId, this.argv.name)
    cloudInfo(`rm ${this.argv.name} -> ok`)
  }
}

export type SecretSetCommandDefinition = typeof commandDefinitions.secret.subcommands.set
export class SecretSetCommand extends CloudCommand<SecretSetCommandDefinition> {
  public async run(): Promise<void> {
    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const { name: profileName, profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = await this.botCloudapiClient(profileName, botId, apiUrl)

    await setConfigVar(client, botId, this.argv.name, this.argv.valueFile, 'secret')
  }
}

async function setConfigVar(
  client: CloudapiClient,
  botId: string,
  name: string,
  valueFile: string | undefined,
  action: 'set' | 'secret'
): Promise<void> {
  if (!isValidConfigVarName(name)) {
    throw new errors.BotpressCLIError(`invalid variable name "${name}" (want ^[A-Za-z_][A-Za-z0-9_]*$)`)
  }
  const value = await readSecretValue('value', valueFile)
  await client.setConfigVar(botId, name, value)
  cloudInfo(`${action} ${name} -> ok`)
}
