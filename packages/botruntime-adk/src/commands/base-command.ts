import { EventEmitter } from 'events'

export interface BaseProgressEvent {
  type: string
  startTime: number
  endTime?: number
}

export interface BaseCommandEvents<TProgress extends BaseProgressEvent = BaseProgressEvent, TDone = never> {
  stdout: (data: string) => void
  stderr: (data: string) => void
  progress: (event: TProgress) => void
  error: (error: { exitCode: number; stderr: string; message: string }) => void
  done: TDone extends never ? never : (result: TDone) => void
}

export abstract class BaseCommand<TProgress extends BaseProgressEvent = BaseProgressEvent, TDone = never> {
  protected events = new EventEmitter()
  private deferred = Promise.withResolvers<TDone>()

  constructor() {
    // Every 'error' emit rejects the deferred, but not all consumers observe
    // `output()` — long-running commands (e.g. `bp dev`) are consumed through
    // the 'error' EVENT instead. Without a pre-attached no-op catch, that
    // unobserved rejection escapes as a global unhandledRejection carrying the
    // full child command line (token and secrets included). Consumers that do
    // await `output()` still see the rejection — this only marks it handled.
    this.deferred.promise.catch(() => {})
  }

  on<K extends keyof BaseCommandEvents<TProgress, TDone>>(
    event: K,
    listener: BaseCommandEvents<TProgress, TDone>[K]
  ): void {
    this.events.on(event as string, listener)
  }

  off<K extends keyof BaseCommandEvents<TProgress, TDone>>(
    event: K,
    listener: BaseCommandEvents<TProgress, TDone>[K]
  ): void {
    this.events.off(event as string, listener)
  }

  protected emit<K extends keyof BaseCommandEvents<TProgress, TDone>>(
    event: K,
    ...args: Parameters<BaseCommandEvents<TProgress, TDone>[K]>
  ): void {
    if (event === 'done') {
      this.deferred.resolve(args[0] as TDone)
    } else if (event === 'error') {
      const error = args[0] as {
        exitCode: number
        stderr: string
        message: string
      }
      const err = new Error(error.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- attaching non-standard properties to Error
      ;(err as any).exitCode = error.exitCode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- attaching non-standard properties to Error
      ;(err as any).stderr = error.stderr
      this.deferred.reject(err)
    }

    if (event !== 'error' || this.events.listenerCount('error') > 0) {
      this.events.emit(event as string, ...args)
    }
  }

  output(): Promise<TDone> {
    return this.deferred.promise
  }

  abstract run(): Promise<void>
  abstract kill(signal?: NodeJS.Signals): void
}
