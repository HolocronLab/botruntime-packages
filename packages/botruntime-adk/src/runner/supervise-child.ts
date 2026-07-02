import os from 'os'
import type { ChildProcess } from 'child_process'

const FORCE_KILL_MS = 2_000

function exitCodeFromClose(code: number | null, signal: NodeJS.Signals | null): number {
  if (code != null) return code
  if (signal) {
    const num = os.constants.signals[signal as keyof typeof os.constants.signals]
    return typeof num === 'number' ? 128 + num : 1
  }
  return 0
}

type SignalListener = (...args: unknown[]) => void

/** Minimal signal-source surface: the global `process` in production, a fake in tests. */
type SignalSource = Pick<NodeJS.EventEmitter, 'on' | 'removeListener'> & {
  listeners?: (eventName: string | symbol) => Function[]
}

export interface SuperviseChildOptions {
  /** Delay before escalating an unresponsive child from its first signal to SIGKILL. */
  forceKillMs?: number
  /** Signal source to listen on. Defaults to the global `process`; injectable for tests. */
  signals?: SignalSource
}

/**
 * Forward SIGINT/SIGTERM from this process to `child`, escalating to SIGKILL on a
 * repeat signal or after a timeout, and resolve with the child's mapped exit code.
 *
 * Without this, killing the parent `adk run` process by PID (e.g. a headless harness
 * or `pkill -f "adk run"`, which matches the parent argv but not the child's
 * `bun … script-runner.ts`) leaves the spawned child orphaned (reparented to PID 1)
 * and still running. While supervising, this temporarily owns SIGINT/SIGTERM so
 * global cleanup handlers cannot convert an interrupted run into exit code 0.
 */
export function superviseChild(child: ChildProcess, options: SuperviseChildOptions = {}): Promise<number> {
  const { forceKillMs = FORCE_KILL_MS, signals = process } = options
  return new Promise<number>((resolve, reject) => {
    let forceTimer: ReturnType<typeof setTimeout> | undefined
    let tornDown = false
    let escalated = false
    let forwardedSignal: NodeJS.Signals | undefined
    const signalNames = ['SIGINT', 'SIGTERM'] as const
    const previousListeners = new Map<NodeJS.Signals, Function[]>()

    const teardown = () => {
      if (tornDown) return
      tornDown = true
      for (const signal of signalNames) {
        signals.removeListener(signal, onSignal)
        for (const listener of previousListeners.get(signal) ?? []) {
          signals.on(signal, listener as SignalListener)
        }
      }
      if (forceTimer) clearTimeout(forceTimer)
    }

    const onSignal = (signal: NodeJS.Signals) => {
      if (child.exitCode != null || child.signalCode != null) return
      if (escalated) {
        child.kill('SIGKILL')
        return
      }
      escalated = true
      forwardedSignal = signal
      child.kill(signal)
      forceTimer = setTimeout(() => child.kill('SIGKILL'), forceKillMs)
      forceTimer.unref?.()
    }

    for (const signal of signalNames) {
      const listeners = signals.listeners?.(signal) ?? []
      previousListeners.set(signal, listeners)
      for (const listener of listeners) {
        signals.removeListener(signal, listener as SignalListener)
      }
      signals.on(signal, onSignal)
    }

    child.on('error', (error) => {
      teardown()
      reject(error)
    })

    child.on('close', (code, signal) => {
      teardown()
      if (code === 0 && forwardedSignal) {
        resolve(exitCodeFromClose(null, forwardedSignal))
        return
      }
      resolve(exitCodeFromClose(code, signal))
    })
  })
}
