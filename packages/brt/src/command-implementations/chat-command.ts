import * as chat from '@holocronlab/botruntime-chat'
import { ApiClient } from '../api'
import { CloudapiClient } from '../api/cloudapi-client'
import { Chat } from '../chat'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { GlobalCommand } from './global-command'
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
export class ChatCommand extends GlobalCommand<ChatCommandDefinition> {
  public async run(): Promise<void> {
    if (process.platform === 'win32') {
      this.logger.warn(
        'The chat command was not tested on Windows and may not work as expected',
      )
    }

    const api = await this.ensureLoginAndCreateClient(this.argv)
    const botId = this.argv.botId ?? (await this._selectBot(api))
    const cloudapi = new CloudapiClient(api.url, api.token)
    const { webhookId, provisioned } = await ensureEvalChatTransport({
      client: cloudapi,
      workspaceId: api.workspaceId,
      botId,
      development: false,
    })
    if (provisioned)
      this.logger.log('Installed the compatible first-party Chat integration')
    const chatApiUrl = chatApiUrlFor(api.url, this.argv.chatApiUrl, webhookId)
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

  private _selectBot = async (api: ApiClient): Promise<string> => {
    const availableBots = await api
      .listAllPages(api.client.listBots, (r) => r.bots)
      .catch((thrown) => {
        throw errors.BotpressCLIError.wrap(
          thrown,
          'Could not fetch existing bots',
        )
      })

    if (!availableBots.length) {
      throw new errors.NoBotsFoundError()
    }

    const prompted = await this.prompt.select(
      'Which bot do you want to deploy?',
      {
        choices: availableBots.map((bot) => ({
          title: bot.name,
          value: bot.id,
        })),
      },
    )

    if (!prompted) {
      throw new errors.ParamRequiredError('Bot Id')
    }

    return prompted
  }
}
