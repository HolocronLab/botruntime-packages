import type { CloudapiClient, LogEntry } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import { cloudInfo } from '../cloud-io'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'

// brt logs — GET /v1/admin/workspaces/{workspaceId}/bots/{botId}/logs using the
// selected workspace profile PAT. The legacy /v1/admin/bots/{id}/logs route is
// bot-principal-only and must never receive a workspace PAT.

const ONE_HOUR_MS = 60 * 60 * 1000
const FOLLOW_POLL_MS = 5_000

export type LogsCommandDefinition = typeof commandDefinitions.logs
export class LogsCommand extends CloudCommand<LogsCommandDefinition> {
  public async run(): Promise<void> {
    const { client, workspaceId, botId } = await this._resolveTarget()

    const level = this.argv.level
    const messageContains = this.argv.grep
    const conversationId = this.argv.conversationId
    const limit = this.argv.limit

    let printed = 0
    let lastTimestamp: string | undefined

    // Drains every page of a single [timeStart, timeEnd) window via nextToken,
    // printing entries as they arrive and stopping early once --limit is hit.
    const drain = async (timeStart: string, timeEnd: string | undefined): Promise<void> => {
      let nextToken: string | undefined
      do {
        const res = await client
          .getWorkspaceBotLogs(workspaceId, botId, {
            timeStart,
            timeEnd,
            level,
            messageContains,
            conversationId,
            nextToken,
          })
          .catch((thrown) => {
            throw errors.BotpressCLIError.wrap(thrown, `could not fetch logs for bot ${botId}`)
          })

        for (const entry of res.logs) {
          this._printEntry(entry)
          lastTimestamp = entry.timestamp
          printed++
          if (limit !== undefined && printed >= limit) return
        }
        nextToken = res.nextToken
      } while (nextToken)
    }

    // The follow cursor advances ONLY past entries we've actually printed. It is
    // never reset to "now": on an empty poll lastTimestamp is unchanged and the
    // cursor holds, so the next poll re-queries from the same point and cannot
    // skip a log written during the sleep interval before the first entry ever
    // arrives (the bug of jumping to a post-sleep `now` on an empty window).
    let cursor = this.argv.since ?? new Date(Date.now() - ONE_HOUR_MS).toISOString()
    await drain(cursor, this.argv.until)
    if (lastTimestamp) cursor = bumpMs(lastTimestamp, 1)

    if (!this.argv.follow || (limit !== undefined && printed >= limit)) {
      return
    }

    cloudInfo(`logs: following bot ${botId} (poll every ${FOLLOW_POLL_MS / 1000}s) — Ctrl-C to stop`)
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_POLL_MS))
      await drain(cursor, undefined)
      if (lastTimestamp) cursor = bumpMs(lastTimestamp, 1)
      if (limit !== undefined && printed >= limit) return
    }
  }

  private _printEntry(entry: LogEntry): void {
    const conv = entry.conversationId ? ` conv=${entry.conversationId}` : ''
    process.stdout.write(`${entry.timestamp} ${entry.level.toUpperCase()} ${entry.message}${conv}\n`)
  }

  private async _resolveTarget(): Promise<{
    client: CloudapiClient
    workspaceId: string
    botId: string
  }> {
    if (this.targetsDevBot) {
      const target = await this.devCloudapiTarget()
      return { client: target.client, workspaceId: target.workspaceId, botId: target.targetBotId }
    }

    const link = this.loadLinkIfPresent() ?? {}
    const botId = this.requireBotId(link)
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    return {
      client: this.machineCloudapiClient(profile, apiUrl),
      workspaceId: profile.workspaceId,
      botId,
    }
  }
}

function bumpMs(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString()
}
