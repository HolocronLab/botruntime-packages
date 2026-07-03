import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { cloudInfo, cloudWarn } from './cloud-io'
import * as errors from './errors'

// brt deploy --adk — build path for ADK "agent" projects (manifest:
// agent.config.ts). Ф1: brt is now the SINGLE binary. It no longer shells out
// to an external `adk`/`bp` build binary; instead it calls the
// @holocronlab/botruntime-adk LIBRARY in-process to generate the synthetic
// classic bot at <dir>/.adk/bot, then builds THAT with brt's own native
// esbuild pipeline (see deploy-command.ts _buildAdkBundle -> BuildCommand),
// and finally normalizes the produced classic-bot bundle to a deterministic
// .brt/dist/index.cjs.
//
// REBRAND RULE: the generator's build dirs (.adk/, .botpress/) are produced by
// the library — brt reads them, it does not rename them.

export const ADK_BUNDLE_REL_PATH = path.join('.brt', 'dist', 'index.cjs')

// The agent-project manifest. Its presence is how brt recognizes an ADK
// "agent" project (as opposed to a Botpress-shaped bot/integration/plugin,
// which are keyed by their own *.definition.ts).
export const AGENT_CONFIG_FILE = 'agent.config.ts'

// Where the library generates the synthetic classic bot.
export const AGENT_BOT_REL_PATH = path.join('.adk', 'bot')

// Where brt's native build drops the generated bot's single-file CJS bundle,
// most-specific first. .adk/bot/.botpress/dist/index.cjs is what BuildCommand
// produces for the generated classic bot; the flatter candidates cover a
// prebuilt bundle handed to brt directly.
const BUNDLE_CANDIDATES = [
  path.join('.adk', 'bot', '.botpress', 'dist', 'index.cjs'),
  path.join('.botpress', 'dist', 'index.cjs'),
  path.join('dist', 'index.cjs'),
]

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// TODO(Ф1 follow-up): expose a `brt check`/typegen path for agent projects that
// calls generateLocalTypes({ projectPath }) from @holocronlab/botruntime-adk to
// emit the .adk/*.d.ts intellisense stubs WITHOUT a full generate+build. Left as
// a TODO to avoid adding a new command surface in this change; generateBotProject
// (the build path below) already emits those types as a side effect, so nothing
// is broken by deferring it.

// Presence of agent.config.ts marks an ADK agent project.
export function isAgentProject(dir: string): boolean {
  return fs.existsSync(path.join(dir, AGENT_CONFIG_FILE))
}

// generateAgentBot calls the @holocronlab/botruntime-adk library IN-PROCESS to
// generate the synthetic classic bot at <dir>/.adk/bot (bot.definition.ts +
// shims targeting @holocronlab/botruntime-sdk). This is exactly what the
// upstream `adk` binary did before it shelled to `bp build` — except here it is
// a plain function call, NOT a child process. Returns the generated bot path.
export async function generateAgentBot(dir: string, opts: { quiet?: boolean } = {}): Promise<string> {
  if (!isAgentProject(dir)) {
    throw new errors.BotpressCLIError(`not an agent project: no ${AGENT_CONFIG_FILE} found in ${dir}`)
  }
  if (!opts.quiet) cloudInfo(`generate: @holocronlab/botruntime-adk -> ${AGENT_BOT_REL_PATH} (in ${dir})`)

  // Lazy import: the ADK library drags in a heavy dependency graph (runtime,
  // otel, …). Load it only when an agent build actually runs, so plain brt
  // commands — and the pure-function unit tests in this module — never pay for
  // it. This is a deferred load of a load-bearing dep, NOT an optional fallback.
  const { generateBotProject } = await import('@holocronlab/botruntime-adk')
  await generateBotProject({ projectPath: dir, adkCommand: 'adk-build' }).catch((thrown) => {
    throw errors.BotpressCLIError.wrap(thrown, 'agent bot generation failed')
  })

  const botPath = path.join(dir, AGENT_BOT_REL_PATH)
  const botDefinition = path.join(botPath, 'bot.definition.ts')
  if (!fs.existsSync(botDefinition)) {
    throw new errors.BotpressCLIError(
      `agent bot generation produced no ${path.join(AGENT_BOT_REL_PATH, 'bot.definition.ts')} in ${dir}`
    )
  }
  return botPath
}

// normalizeBundle copies whatever single-file bundle brt's native build
// produced (under one of BUNDLE_CANDIDATES) to the deterministic
// .brt/dist/index.cjs, and returns that path.
export function normalizeBundle(dir: string, opts: { quiet?: boolean } = {}): string {
  const produced = BUNDLE_CANDIDATES.map((p) => path.join(dir, p)).find((p) => fs.existsSync(p))
  if (!produced) {
    throw new errors.BotpressCLIError(
      `build produced no bundle; looked for ${BUNDLE_CANDIDATES.join(', ')}. ` +
        'If the toolchain emits elsewhere, set BRT_BUNDLE_PATH.'
    )
  }

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(produced, out)
  if (!opts.quiet) cloudInfo(`bundle -> ${ADK_BUNDLE_REL_PATH} (${fs.statSync(out).size} bytes)`)
  return out
}

// ensureBundle returns an up-to-date bundle path, invoking `build` (the
// in-process generate + native-build orchestration owned by the caller) if the
// bundle is missing or `force` is set. BRT_BUNDLE_PATH still short-circuits to
// a prebuilt file; a reusable existing bundle short-circuits before building.
export async function ensureBundle(dir: string, force: boolean, build: () => Promise<string>): Promise<string> {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  if (!force && fs.existsSync(out)) {
    cloudWarn(`reusing existing ${ADK_BUNDLE_REL_PATH} (delete it to force a rebuild)`)
    return out
  }
  return build()
}

// requireExistingBundle backs `brt deploy --adk --noBuild`: the caller
// explicitly opted out of building, so a missing bundle is a loud failure,
// never a silent fall-through to a build the caller asked to skip.
export function requireExistingBundle(dir: string): string {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  if (!fs.existsSync(out)) {
    throw new errors.BotpressCLIError(`--noBuild was set but no existing bundle was found at ${out}`)
  }
  return out
}

function bundlePathOverride(): string | undefined {
  const env = process.env['BRT_BUNDLE_PATH']
  if (!env) return undefined
  if (!fs.existsSync(env)) {
    throw new errors.BotpressCLIError(`BRT_BUNDLE_PATH is set but the file is missing: ${env}`)
  }
  return env
}
