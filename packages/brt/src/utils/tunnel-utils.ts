import { TunnelTail, ClientCloseEvent, ClientErrorEvent, errors } from '@holocronlab/botruntime-tunnel'
import { BotpressCLIError } from '../errors'
import { Logger } from '../logger'
import { EventEmitter } from './event-emitter'

// The dev bot is registered (createBot before start), but cloudapi only begins
// forwarding to a tunnel id after its supervisor reconcile (~15s), so the first
// connect can 404 the isTunnelBot gate until then. Retry the INITIAL connect for
// a window comfortably above the reconcile interval before giving up. (An
// optional cloudapi sync-push registration collapses this to sub-second; the
// retry is the correctness floor either way.)
const INITIAL_CONNECT_RETRY_MS = 30_000
const INITIAL_CONNECT_RETRY_INTERVAL_MS = 1_000

export type ReconnectionTriggerEvent =
  | {
      type: 'init'
      ev: null
    }
  | {
      type: 'error'
      ev: ClientErrorEvent
    }
  | {
      type: 'close'
      ev: ClientCloseEvent
    }

export type ReconnectedEvent = {
  tunnel: TunnelTail
  ev: ReconnectionTriggerEvent
}

export class ReconnectionFailedError extends Error {
  public constructor(
    public readonly event: ReconnectionTriggerEvent,
    cause?: Error
  ) {
    const reason = ReconnectionFailedError._reason(event)
    const message = cause ? `Reconnection failed: ${reason}: ${cause.message}` : `Reconnection failed: ${reason}`
    const options = cause ? { cause } : undefined
    super(message, options)
  }

  private static _reason(event: ReconnectionTriggerEvent): string {
    if (event.type === 'error') {
      return 'error'
    }

    if (event.type === 'close') {
      return `${event.ev.code} ${event.ev.reason}`
    }

    return 'init'
  }
}

export class TunnelSupervisor {
  private _tunnel?: TunnelTail
  private _closed = false
  private _started = false

  public readonly events = new EventEmitter<{
    connectionFailed: { ev: ReconnectionTriggerEvent; cause: Error }
    manuallyClosed: null
    connected: {
      tunnel: TunnelTail
      ev: ReconnectionTriggerEvent
    }
  }>()

  public constructor(
    private _tunnelUrl: string,
    private _tunnelId: string,
    private _logger: Logger
  ) {}

  public async start(): Promise<void> {
    if (this._closed) {
      throw new Error('Cannot start: Tunnel is closed')
    }
    if (this._started) {
      throw new Error('Cannot start: Tunnel is already started')
    }

    this._started = true
    const tunnel = await this._reconnect({ type: 'init', ev: null })
    this._tunnel = tunnel
  }

  public get closed(): boolean {
    return this._closed
  }

  /**
   * @returns Promise that rejects when a reconnection attempt fails and resolves when the tunnel is closed manually
   */
  public async wait(): Promise<void> {
    if (this._closed) {
      throw new Error('Cannot wait: Tunnel is closed')
    }

    return new Promise((resolve, reject) => {
      this.events.on('connectionFailed', ({ ev, cause }) => {
        reject(new ReconnectionFailedError(ev, cause))
      })

      this.events.on('manuallyClosed', () => {
        resolve()
      })
    })
  }

  public close(): void {
    if (this._closed) {
      return
    }

    this._closed = true
    this._tunnel?.close()
    this.events.emit('manuallyClosed', null)
  }

  private _reconnectSync(ev: ReconnectionTriggerEvent): void {
    void this._reconnect(ev)
      .then((t) => {
        this._tunnel = t
      })
      .catch((thrown) => {
        // carry the real failure as the cause; the dev server then tears down and the single
        // "running the dev server" error surfaces this reason (avoids a duplicate log line here)
        this.events.emit('connectionFailed', { ev, cause: BotpressCLIError.map(thrown) })
      })
  }

  private async _reconnect(ev: ReconnectionTriggerEvent): Promise<TunnelTail> {
    const newTunnel = async () => {
      const tunnel = await TunnelTail.new(this._tunnelUrl, this._tunnelId)
      this._registerListeners(tunnel)
      this.events.emit('connected', { tunnel, ev })
      return tunnel
    }

    if (ev.type === 'init') {
      return this._connectWithInitialRetry(newTunnel)
    }

    const line = this._logger.line()
    line.started('Reconnecting tunnel...')
    const tunnel = await newTunnel()
    line.success('Reconnected')
    line.commit()
    return tunnel
  }

  // Bounded retry for the very first tunnel connect only. Reconnects after a
  // live tunnel drops are handled separately (and already retry via the
  // error/close events); this covers the cold-start race where the dev bot's
  // tunnel id isn't forwardable yet. Fails loud with the last real error once
  // the window elapses.
  private async _connectWithInitialRetry(newTunnel: () => Promise<TunnelTail>): Promise<TunnelTail> {
    const deadline = Date.now() + INITIAL_CONNECT_RETRY_MS
    const line = this._logger.line()
    line.started('Connecting dev tunnel...')
    let attempt = 0
    for (;;) {
      attempt++
      try {
        const tunnel = await newTunnel()
        line.success('Dev tunnel connected')
        line.commit()
        return tunnel
      } catch (thrown) {
        const err = BotpressCLIError.map(thrown)
        if (Date.now() >= deadline) {
          line.error(`Dev tunnel connection failed: ${err.message}`)
          line.commit()
          throw err
        }
        line.started(`Connecting dev tunnel (waiting for dev bot registration, attempt ${attempt})...`)
        await new Promise((resolve) => setTimeout(resolve, INITIAL_CONNECT_RETRY_INTERVAL_MS))
      }
    }
  }

  private _registerListeners(tunnel: TunnelTail) {
    tunnel.events.on('error', ({ target, type }) => {
      this._logger.error(`Tunnel error: ${type}`)
      this._reconnectSync({ type: 'error', ev: { target, type } })
    })
    tunnel.events.on('close', ({ code, reason, target, type, wasClean }) => {
      this._logger.error(`Tunnel closed: ${code} ${reason}`)

      if (code === errors.CLOSE_CODES.TUNNEL_ID_CONFLICT) {
        throw new Error('Cannot start: Tunnel Id is already used, choose a different tunnel id.')
      }

      this._reconnectSync({ type: 'close', ev: { code, reason, target, type, wasClean } })
    })
  }
}
