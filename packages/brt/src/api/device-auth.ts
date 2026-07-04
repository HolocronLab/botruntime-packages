import { spawn } from 'child_process'
import * as errors from '../errors'

// Device Authorization Grant (RFC 8628) client for `brt login`. Two unauthenticated
// POSTs against cloudapi: /device/start mints a device+user code, /device/token is
// polled until the user approves in the browser and the server hands back a PAT.
// Native fetch only — no auth header (there is no token yet, that's the point).

export interface DeviceStartResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number // seconds until deviceCode expires
  interval: number // seconds between poll attempts
}

export type DeviceTokenStatus = 'complete' | 'pending' | 'expired' | 'consumed' | 'invalid'

export interface DeviceTokenResponse {
  status: DeviceTokenStatus
  token?: string // present only when status === 'complete' (the PAT)
  interval?: number // RFC 8628 slow_down: server may ask us to poll less often
}

export interface DeviceAuthLogger {
  log: (msg: string) => void
  debug: (msg: string) => void
}

export interface DeviceAuthDeps {
  clientName?: string
  logger: DeviceAuthLogger
  openUrl?: (url: string) => void
  // injectable for tests; defaults to real setTimeout
  sleep?: (ms: number) => Promise<void>
}

const START_PATH = '/v1/admin/cli/device/start'
const TOKEN_PATH = '/v1/admin/cli/device/token'

async function post<T>(apiUrl: string, path: string, body: unknown): Promise<T> {
  const url = `${apiUrl.replace(/\/+$/, '')}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (thrown) {
    throw new errors.BotpressCLIError(`device auth: POST ${path} failed: ${(thrown as Error).message}`, {
      cause: thrown as Error,
    })
  }
  const text = await res.text()
  if (!res.ok) {
    // A 404 almost always means the target apiUrl predates the device-auth flow;
    // point the user at the token fallbacks rather than a bare HTTP error.
    if (res.status === 404) {
      throw new errors.BotpressCLIError(
        `device auth endpoint not available at ${apiUrl} (${path} → 404). ` +
          'Log in with a Personal Access Token instead: `brt login --token <PAT>` (or `brt login --no-device`).'
      )
    }
    throw new errors.BotpressCLIError(`device auth: POST ${path} → HTTP ${res.status} ${text}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new errors.BotpressCLIError(`device auth: POST ${path} returned a non-JSON body: ${text.slice(0, 200)}`)
  }
}

const isFinitePositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export async function startDeviceAuth(apiUrl: string, clientName: string = 'brt'): Promise<DeviceStartResponse> {
  const res = await post<DeviceStartResponse>(apiUrl, START_PATH, { clientName })
  // post() casts the JSON as-is, so validate the fields the poll loop depends on.
  // A 200 that omits interval/expiresIn (older / partially-deployed server) would
  // otherwise NaN into a timeout-less busy-loop hammering /device/token — fail
  // loud here instead of degrading silently.
  if (!isFinitePositive(res.expiresIn) || !isFinitePositive(res.interval)) {
    throw new errors.BotpressCLIError(
      `device auth: /start returned an invalid response (expiresIn=${res.expiresIn}, interval=${res.interval}); ` +
        'expected positive numbers. Log in with `brt login --token <PAT>` instead.'
    )
  }
  if (!res.deviceCode || !res.verificationUriComplete) {
    throw new errors.BotpressCLIError(
      'device auth: /start response missing deviceCode/verificationUriComplete. ' +
        'Log in with `brt login --token <PAT>` instead.'
    )
  }
  return res
}

export function pollDeviceToken(apiUrl: string, deviceCode: string): Promise<DeviceTokenResponse> {
  return post<DeviceTokenResponse>(apiUrl, TOKEN_PATH, { deviceCode })
}

// Best-effort browser open. The caller ALWAYS prints the URL + code too, so a
// failure here (headless, SSH, no handler) is non-fatal — swallow it.
export function openUrl(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // opener missing / not permitted — ignore
    child.unref()
  } catch {
    // spawn itself threw — ignore, the URL was already printed
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Drives the RFC 8628 flow to completion and returns the PAT. Throws a loud,
// actionable BotpressCLIError on expiry/timeout/consumed/invalid — never returns
// an empty or partial credential.
export async function deviceAuthenticate(apiUrl: string, deps: DeviceAuthDeps): Promise<string> {
  const sleep = deps.sleep ?? defaultSleep
  const start = await startDeviceAuth(apiUrl, deps.clientName ?? 'brt')

  deps.logger.log(`To authenticate, open this URL in your browser:\n  ${start.verificationUriComplete}`)
  deps.logger.log(`If it does not open automatically, go to ${start.verificationUri} and enter code: ${start.userCode}`)
  deps.openUrl?.(start.verificationUriComplete)

  const deadline = Date.now() + start.expiresIn * 1000
  let intervalMs = Math.max(1, start.interval) * 1000

  deps.logger.log('Waiting for authorization…')
  for (;;) {
    await sleep(intervalMs)
    if (Date.now() > deadline) {
      throw new errors.BotpressCLIError(
        `device auth timed out after ${start.expiresIn}s without authorization — re-run \`brt login\` to try again`
      )
    }

    const res = await pollDeviceToken(apiUrl, start.deviceCode)
    switch (res.status) {
      case 'complete':
        if (!res.token) {
          throw new errors.BotpressCLIError('device auth reported "complete" but returned no token')
        }
        return res.token
      case 'expired':
        throw new errors.BotpressCLIError('device auth code expired before you authorized it — re-run `brt login`')
      case 'consumed':
        throw new errors.BotpressCLIError('device auth code was already used — re-run `brt login`')
      case 'invalid':
        throw new errors.BotpressCLIError('device auth code is invalid — re-run `brt login`')
      case 'pending':
      default:
        // Not authorized yet. Honor a server-requested slow-down, then keep polling.
        if (typeof res.interval === 'number' && res.interval > 0) {
          intervalMs = res.interval * 1000
        }
        continue
    }
  }
}
