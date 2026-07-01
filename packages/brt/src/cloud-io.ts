import * as fs from 'fs'
import * as errors from './errors'

// Output/input helpers for the bespoke-cloudapi-wire commands (`brt link`,
// `brt config`, `brt secret`). These commands are BYTE-COMPAT ported from the
// (deleted) thin brt CLI, whose operational bots/scripts may parse their stdout;
// they intentionally print with the thin CLI's own "[brt] " prefix convention
// (see thin util.ts info/warn) rather than the fork's Logger (colored ✓/⚠/×
// symbol prefixes), which is used everywhere else in this CLI.
const BRAND = 'brt'

export function cloudInfo(message: string): void {
  process.stdout.write(`[${BRAND}] ${message}\n`)
}

export function cloudWarn(message: string): void {
  process.stderr.write(`[${BRAND}] warning: ${message}\n`)
}

// Reads all of stdin as text (portable across bun/node — no Bun-specific global).
async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Secrets/config values are read from stdin or --value-file ONLY, never argv, so
// they never leak into shell history or the process list (ported from thin
// util.ts readSecretStdin). Returns the value with a single trailing newline
// stripped (matches thin: `.replace(/\r?\n$/, '')`).
export async function readSecretValue(label: string, valueFile?: string): Promise<string> {
  const raw = valueFile ? await fs.promises.readFile(valueFile, 'utf8') : await readStdinText()
  const value = raw.replace(/\r?\n$/, '')
  if (!value) {
    throw new errors.BotpressCLIError(`empty ${label} ${valueFile ? `in ${valueFile}` : 'on stdin'}`)
  }
  return value
}

// Cloudapi enforces this on config-variable names; catch it client-side before
// it hits the wire (ported from thin commands/check.ts isValidConfigVarName).
const CONFIG_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isValidConfigVarName(name: string): boolean {
  return CONFIG_VAR_RE.test(name)
}
