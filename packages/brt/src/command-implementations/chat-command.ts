import * as chat from '@holocronlab/botruntime-chat'
import type { CloudapiClient } from '../api/cloudapi-client'
import { Chat } from '../chat'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'
import { ensureEvalChatTransport } from './eval-chat-transport'

type ChatCloudTarget =
  | {
      client: CloudapiClient
      output: { environment: 'production'; workspaceId: string; botId: string }
    }
  | {
      client: CloudapiClient
      runtimeBotId: string
      output: {
        environment: 'development'
        workspaceId: string
        runtimeBotId: string
        targetBotId: string
      }
    }

export function chatApiUrlFor(
  apiUrl: string,
  override: string | undefined,
  webhookId: string,
): string {
  const base = (override ?? `${apiUrl.replace(/\/+$/, '')}/hooks`).replace(
    /\/+$/,
    '',
  )
  return `${base}/${encodeURIComponent(webhookId)}`
}

export type ChatCommandDefinition = typeof commandDefinitions.chat

export function chatTransportTarget(target: ChatCloudTarget): Parameters<typeof ensureEvalChatTransport>[0] {
  if ('runtimeBotId' in target) {
    return {
      client: target.client,
      workspaceId: target.output.workspaceId,
      botId: target.output.targetBotId,
      development: true,
    }
  }
  return {
    client: target.client,
    workspaceId: target.output.workspaceId,
    botId: target.output.botId,
    development: false,
  }
}

export class ChatCommand extends CloudCommand<ChatCommandDefinition> {
  public async run(): Promise<void> {
    if (process.platform === 'win32') {
      this.logger.warn(
        'The chat command was not tested on Windows and may not work as expected',
      )
    }

    if (this.argv.local && !this.argv.dev) {
      throw new errors.BotpressCLIError(
        '--local requires --dev for brt chat; production and development targets cannot be mixed'
      )
    }
    const target = await this._chatCloudapiTarget()
    if ('runtimeBotId' in target) await target.client.requireEvalBotReady(target.runtimeBotId)
    const transportTarget = chatTransportTarget(target)
    const { webhookId, provisioned } = await ensureEvalChatTransport(transportTarget)
    if (provisioned)
      this.logger.log('Installed the compatible first-party Chat integration')
    const chatApiUrl = chatApiUrlFor(transportTarget.client.base, this.argv.chatApiUrl, webhookId)
    this.logger.debug(`using chat api url: "${chatApiUrl}"`)
    const chatClient = await chat.Client.connect({ apiUrl: chatApiUrl })
    await this._chat(chatClient)
  }

  private async _chatCloudapiTarget(): Promise<ChatCloudTarget> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      return {
        client: target.client,
        runtimeBotId: target.runtimeBotId,
        output: {
          environment: 'development',
          workspaceId: target.workspaceId,
          runtimeBotId: target.runtimeBotId,
          targetBotId: target.targetBotId,
        },
      }
    }
    const target = await this.workspaceAdminCloudapiTarget()
    return {
      client: target.client,
      output: {
        environment: 'production',
        workspaceId: target.workspaceId,
        botId: target.botId,
      },
    }
  }

  private _chat = async (client: chat.AuthenticatedClient): Promise<void> => {
    const convLine = this.logger.line()
    convLine.started('Creating a conversation...')
    const { conversation } = await client.createConversation({})
    convLine.success(`Conversation created with id "${conversation.id}"`)
    convLine.commit()

    const chat = Chat.launch({
      client,
      conversationId: conversation.id,
      protocol: this.argv.protocol,
    })
    await chat.wait()
  }
}
