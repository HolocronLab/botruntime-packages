import { randomBytes } from 'node:crypto'
import type { CloudapiClient } from '../api/cloudapi-client'

export const EVAL_CHAT_VERSION = '0.7.6'

type EvalChatTarget = {
  client: CloudapiClient
  workspaceId: string
  botId: string
  development: boolean
}

type EvalChatResult = {
  webhookId: string
  provisioned: boolean
}

type InstallationLike = {
  name?: string
  version?: string
  webhookId?: string
  enabled?: boolean
}

type RegistrationRetryOptions = {
  sleep?: (milliseconds: number) => Promise<void>
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export async function registerWithReadinessRetry<T>(
  register: () => Promise<T>,
  options: RegistrationRetryOptions = {}
): Promise<T> {
  const sleep = options.sleep ?? wait
  const backoff = [250, 500, 1_000, 2_000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await register()
    } catch (error) {
      const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined
      if ((status !== 502 && status !== 503) || attempt >= backoff.length) throw error
      await sleep(backoff[attempt]!)
    }
  }
}

const findChat = (installations: InstallationLike[]) =>
  installations.find(
    (installation) =>
      installation.name === 'chat' && installation.enabled !== false,
  )

export async function ensureEvalChatTransport(
  target: EvalChatTarget,
): Promise<EvalChatResult> {
  const installations = target.development
    ? (
        await target.client.listWorkspaceIntegrations(
          target.workspaceId,
          target.botId,
        )
      ).installations
    : Object.values(
        (await target.client.getDevBotTarget(target.botId, target.workspaceId))
          .bot.integrations,
      ).map((installation) => ({
        name: installation.name,
        version: installation.version,
        webhookId: installation.webhookId,
        enabled: true,
      }))

  const existing = findChat(installations)
  if (existing) {
    if (existing.version !== EVAL_CHAT_VERSION) {
      throw new Error(
        `chat integration ${existing.version} is installed, but hosted eval requires ${EVAL_CHAT_VERSION}; repoint or reinstall the exact version`,
      )
    }
    if (!existing.webhookId)
      throw new Error('chat integration is installed without a webhookId')
    return { webhookId: existing.webhookId, provisioned: false }
  }

  const config = { encryptionKey: randomBytes(32).toString('base64url') }
  const installed = target.development
    ? await target.client.installWorkspaceIntegration(
        target.workspaceId,
        target.botId,
        'chat',
        EVAL_CHAT_VERSION,
        config,
      )
    : await target.client.installIntegration(
        target.botId,
        'chat',
        EVAL_CHAT_VERSION,
        config,
      )

  if (target.development) {
    await registerWithReadinessRetry(() =>
      target.client.registerWorkspaceIntegration(target.workspaceId, target.botId, installed.webhookId)
    )
  } else {
    await registerWithReadinessRetry(() => target.client.registerIntegration(target.botId, installed.webhookId))
  }
  return { webhookId: installed.webhookId, provisioned: true }
}
