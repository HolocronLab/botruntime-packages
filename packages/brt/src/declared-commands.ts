import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// botruntime.commands.json — a project-level manifest declaring the slash
// commands an ADK bot exposes, ported verbatim (filename, shape, validation
// rules) from the (deleted) thin brt CLI's commands/declared-commands.ts. Read
// by `brt deploy --adk` and sent to cloudapi as PUT /v1/admin/bots/{id}
// {..., commands: [...]}` (see src/api/cloudapi-client.ts putBundle).

export interface DeclaredCommand {
  command: string
  description: string
}

const COMMAND_FILE = 'botruntime.commands.json'
const COMMAND_RE = /^[a-z0-9_]{1,32}$/

export function extractDeclaredCommands(dir: string): DeclaredCommand[] {
  const filePath = path.join(dir, COMMAND_FILE)
  if (!fs.existsSync(filePath)) return []

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${COMMAND_FILE}: invalid JSON`)
  }

  const arr = Array.isArray(raw) ? raw : objectCommands(raw)
  const seen = new Set<string>()
  return arr.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new errors.BotpressCLIError(`${COMMAND_FILE}: commands[${i}] must be an object`)
    }
    const rec = item as Record<string, unknown>
    const command = String(rec['command'] ?? rec['name'] ?? '')
      .trim()
      .replace(/^\//, '')
    const description = String(rec['description'] ?? '').trim()
    if (!COMMAND_RE.test(command)) {
      throw new errors.BotpressCLIError(`${COMMAND_FILE}: commands[${i}].command must match ${COMMAND_RE}`)
    }
    if (description.length === 0 || [...description].length > 256) {
      throw new errors.BotpressCLIError(`${COMMAND_FILE}: commands[${i}].description must be 1..256 characters`)
    }
    if (seen.has(command)) {
      throw new errors.BotpressCLIError(`${COMMAND_FILE}: duplicate command "${command}"`)
    }
    seen.add(command)
    return { command, description }
  })
}

function objectCommands(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { commands?: unknown }).commands)) {
    throw new errors.BotpressCLIError(`${COMMAND_FILE}: expected an array or {"commands":[...]}`)
  }
  return (raw as { commands: unknown[] }).commands
}
