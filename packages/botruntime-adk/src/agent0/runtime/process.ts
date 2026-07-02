import { execFileSync, type ChildProcessByStdio, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, homedir, platform, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { prepareAgent0OpenCodeRuntime, type Agent0OpenCodeRuntimeRenderOptions } from './engine.js'

declare const __OPENCODE_VERSION__: string | undefined

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const AGENT0_OPENCODE_HOSTNAME = '127.0.0.1'
const DEFAULT_SERVER_USERNAME = 'agent0'
const OPENCODE_VERSION = typeof __OPENCODE_VERSION__ !== 'undefined' ? __OPENCODE_VERSION__ : '0.0.0'
type Agent0OpenCodeChildProcess = ChildProcessByStdio<null, Readable, Readable>

const PROVIDER_AUTH_ENV_KEYS = new Set([
  'AICORE_SERVICE_KEY',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_OPENAI_API_KEY',
  'CEREBRAS_API_KEY',
  'CF_AIG_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'COHERE_API_KEY',
  'DASHSCOPE_API_KEY',
  'DEEPSEEK_API_KEY',
  'FIREWORKS_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'MOONSHOT_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'PERPLEXITY_API_KEY',
  'QWEN_API_KEY',
  'TOGETHER_API_KEY',
  'TOGETHERAI_API_KEY',
  'XAI_API_KEY',
])

export interface Agent0OpenCodeServerAuth {
  username: string
  password: string
}

export interface Agent0OpenCodeProcessOptions extends Agent0OpenCodeRuntimeRenderOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  binaryPath?: string
  serverUsername?: string
  serverPassword?: string
  startupTimeoutMs?: number
  signal?: AbortSignal
  onLog?: (message: string) => void
}

export interface Agent0OpenCodeProcess {
  baseURL: string
  authHeaders: Record<string, string>
  renderedOpenCodeConfigHash: string
  pid?: number
  stop: () => Promise<void>
}

export class Agent0OpenCodeStartupTimeoutError extends AdkError<'AGENT0_OPENCODE_STARTUP_TIMEOUT'> {
  readonly startupOutput?: string

  constructor(
    readonly timeoutMs: number,
    options: { cause?: unknown; startupOutput?: string } = {}
  ) {
    super({
      code: 'AGENT0_OPENCODE_STARTUP_TIMEOUT',
      message:
        `Agent(0) private OpenCode runtime did not start within ${timeoutMs}ms` +
        (options.startupOutput ? `\n${options.startupOutput}` : ''),
      // A startup timeout is an environment condition (slow/cold container),
      // not an internal bug — the CLI retries it rather than treating it as a crash.
      expected: true,
      details: { timeoutMs },
      cause: options.cause,
    })
    if (options.startupOutput !== undefined) {
      this.startupOutput = options.startupOutput
    }
  }
}

export interface Agent0OpenCodeBinaryResolveOptions {
  homeDir?: string
  version?: string
  fetch?: typeof fetch
  onLog?: (message: string) => void
  findNodeModulesBinary?: () => string | null
}

export function sanitizeAgent0OpenCodeBaseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !shouldStripEnv(key)))
}

export function buildAgent0OpenCodeProcessEnv(options: {
  baseEnv: NodeJS.ProcessEnv
  runtimeEnv: Record<string, string>
  serverAuth: Agent0OpenCodeServerAuth
}): NodeJS.ProcessEnv {
  return {
    ...sanitizeAgent0OpenCodeBaseEnv(options.baseEnv),
    ...options.runtimeEnv,
    OPENCODE_SERVER_USERNAME: options.serverAuth.username,
    OPENCODE_SERVER_PASSWORD: options.serverAuth.password,
  }
}

export function buildAgent0OpenCodeAuthHeaders(auth: Agent0OpenCodeServerAuth): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
  }
}

export async function resolveAgent0OpenCodeBinary(options: Agent0OpenCodeBinaryResolveOptions = {}): Promise<string> {
  const local = (options.findNodeModulesBinary ?? findAgent0OpenCodeBinaryInNodeModules)()
  if (local) return local

  const cached = getCachedAgent0OpenCodeBinary(options)
  if (cached) return cached

  return downloadAgent0OpenCodeBinary(options)
}

function findAgent0OpenCodeBinaryInNodeModules(): string | null {
  const require = createRequire(import.meta.url)
  try {
    const packageJsonPath = require.resolve('opencode-ai/package.json')
    const packageDir = dirname(packageJsonPath)
    const candidates = [resolve(packageDir, 'bin', 'opencode.exe'), resolve(packageDir, 'bin', 'opencode')]
    return candidates.find((candidate) => existsSync(candidate)) ?? null
  } catch {
    return null
  }
}

function getCachedAgent0OpenCodeBinary(
  options: Pick<Agent0OpenCodeBinaryResolveOptions, 'homeDir' | 'version'>
): string | null {
  const binary = join(getAgent0OpenCodeCacheDir(options), getAgent0OpenCodeBinaryName())
  return existsSync(binary) ? binary : null
}

async function downloadAgent0OpenCodeBinary(options: Agent0OpenCodeBinaryResolveOptions): Promise<string> {
  const version = options.version ?? OPENCODE_VERSION
  if (version === '0.0.0') {
    throw new AdkError({
      code: 'AGENT0_OPENCODE_VERSION_UNRESOLVED',
      message: 'Unable to resolve pinned opencode-ai version',
      expected: false,
    })
  }

  const { name, binary } = getAgent0OpenCodePlatformPackage()
  const tarballUrl = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`
  const fetchImpl = options.fetch ?? fetch
  const cacheDir = getAgent0OpenCodeCacheDir(options)
  const tmpDirPath = join(tmpdir(), `agent0-opencode-download-${Date.now()}`)

  options.onLog?.(`Downloading opencode v${version} (${name})...`)
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(tmpDirPath, { recursive: true })

  try {
    const tarPath = join(tmpDirPath, 'opencode.tgz')
    const response = await fetchImpl(tarballUrl)
    if (!response.ok || !response.body) {
      throw new AdkError({
        code: 'AGENT0_OPENCODE_DOWNLOAD_FAILED',
        message: `Failed to download ${tarballUrl}: ${response.status} ${response.statusText}`,
        expected: true,
      })
    }
    await pipeline(response.body, createWriteStream(tarPath))

    const extractDir = join(tmpDirPath, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    execFileSync('tar', ['xzf', tarPath, '-C', extractDir, `package/bin/${binary}`])

    const extractedBinary = join(extractDir, 'package', 'bin', binary)
    if (!existsSync(extractedBinary)) {
      throw new AdkError({
        code: 'AGENT0_OPENCODE_DOWNLOAD_FAILED',
        message: `Binary not found at expected path package/bin/${binary} in ${name}@${version} tarball`,
        expected: true,
      })
    }

    const destBinary = join(cacheDir, binary)
    const tmpBinary = `${destBinary}.tmp`
    copyFileSync(extractedBinary, tmpBinary)
    if (platform() !== 'win32') chmodSync(tmpBinary, 0o755)
    renameSync(tmpBinary, destBinary)
    options.onLog?.(`Opencode v${version} cached at ${cacheDir}`)
    return destBinary
  } finally {
    try {
      rmSync(tmpDirPath, { recursive: true, force: true })
    } catch {
      // Best-effort temp-dir cleanup; a leftover tmpdir must not mask the
      // download/extract result.
    }
  }
}

function getAgent0OpenCodeCacheDir(options: Pick<Agent0OpenCodeBinaryResolveOptions, 'homeDir' | 'version'>): string {
  return join(options.homeDir ?? homedir(), '.adk', 'opencode', options.version ?? OPENCODE_VERSION)
}

function getAgent0OpenCodeBinaryName(): string {
  return platform() === 'win32' ? 'opencode.exe' : 'opencode'
}

function getAgent0OpenCodePlatformPackage(): { name: string; binary: string } {
  const plat = platform() === 'win32' ? 'windows' : platform()
  const packageArch = arch() === 'arm64' ? 'arm64' : 'x64'
  return {
    name: `opencode-${plat}-${packageArch}`,
    binary: getAgent0OpenCodeBinaryName(),
  }
}

export async function startAgent0OpenCodeProcess(
  options: Agent0OpenCodeProcessOptions
): Promise<Agent0OpenCodeProcess> {
  const runtime = await prepareAgent0OpenCodeRuntime(options)
  const baseEnv = options.env ?? process.env
  const serverAuth = {
    username: options.serverUsername ?? DEFAULT_SERVER_USERNAME,
    password: options.serverPassword ?? randomUUID(),
  }
  const child = spawn(
    options.binaryPath ?? (await resolveAgent0OpenCodeBinary({ onLog: options.onLog })),
    ['serve', '--hostname', AGENT0_OPENCODE_HOSTNAME, '--port', '0', '--pure'],
    {
      cwd: options.cwd ?? options.paths.canonicalProjectPath,
      env: buildAgent0OpenCodeProcessEnv({
        baseEnv,
        runtimeEnv: {
          ...runtime.env,
          PATH: prependPath(options.paths.engineBinDir, baseEnv.PATH ?? baseEnv.Path),
        },
        serverAuth,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  try {
    const baseURL = await waitForOpenCodeServer(child, {
      timeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      signal: options.signal,
      onLog: options.onLog,
    })
    return {
      baseURL,
      authHeaders: buildAgent0OpenCodeAuthHeaders(serverAuth),
      renderedOpenCodeConfigHash: runtime.renderedOpenCodeConfigHash,
      pid: child.pid,
      stop: () => stopAgent0OpenCodeProcess(child),
    }
  } catch (error) {
    await stopAgent0OpenCodeProcess(child)
    throw error
  }
}

export async function stopAgent0OpenCodeProcess(child: Agent0OpenCodeChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolveStop()
    }, 1_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })
    child.kill('SIGTERM')
  })
}

function shouldStripEnv(key: string): boolean {
  const normalized = key.toUpperCase()
  return (
    normalized.startsWith('OPENCODE_') ||
    normalized.startsWith('XDG_') ||
    normalized.startsWith('AGENT0_') ||
    PROVIDER_AUTH_ENV_KEYS.has(normalized)
  )
}

async function waitForOpenCodeServer(
  child: Agent0OpenCodeChildProcess,
  options: { timeoutMs: number; signal?: AbortSignal; onLog?: (message: string) => void }
): Promise<string> {
  const chunks: string[] = []

  return new Promise((resolveReady, rejectReady) => {
    let settled = false
    const timeout = setTimeout(() => {
      finish(new Agent0OpenCodeStartupTimeoutError(options.timeoutMs))
    }, options.timeoutMs)

    const finish = (error: Error | undefined, url?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
      options.signal?.removeEventListener('abort', onAbort)
      if (error) rejectReady(appendStartupOutput(error, chunks))
      else resolveReady(url!)
    }
    const onData = (data: Buffer) => {
      const text = data.toString('utf8')
      chunks.push(text)
      options.onLog?.(text)
      const match = /opencode server listening on (http:\/\/[^\s]+)/.exec(chunks.join(''))
      if (match) finish(undefined, match[1])
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(`Agent(0) private OpenCode runtime exited before startup: code=${code} signal=${signal}`))
    }
    const onError = (error: Error) => {
      finish(error)
    }
    const onAbort = () => {
      child.kill('SIGTERM')
      finish(new Error('Agent(0) private OpenCode runtime startup aborted'))
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', onError)
    child.on('exit', onExit)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
  })
}

function appendStartupOutput(error: Error, chunks: string[]): Error {
  const output = chunks.join('').trim()
  if (!output) return error

  if (error instanceof Agent0OpenCodeStartupTimeoutError) {
    return new Agent0OpenCodeStartupTimeoutError(error.timeoutMs, {
      cause: error.cause,
      startupOutput: output,
    })
  }

  const wrapped = new Error(`${error.message}\n${output}`)
  wrapped.cause = error
  return wrapped
}

function prependPath(dir: string, currentPath: string | undefined): string {
  return currentPath ? `${dir}${delimiter}${currentPath}` : dir
}
