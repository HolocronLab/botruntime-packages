import * as chat from '@holocronlab/botruntime-chat'
import { Chat } from '../chat'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand, type EvalCloudTarget } from './cloud-command'
import { ensureEvalChatTransport } from './eval-chat-transport'

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

export function chatTransportTarget(target: EvalCloudTarget): Parameters<typeof ensureEvalChatTransport>[0] {
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
    const target = await this.evalCloudapiTarget()
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
