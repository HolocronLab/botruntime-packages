import * as errors from '../errors'
import type { Logger } from '../logger'
import type { CommandArgv, CommandDefinition } from '../typings'

export abstract class BaseCommand<C extends CommandDefinition> {
  private _exitCode = 0

  public constructor(
    protected readonly logger: Logger,
    protected readonly argv: CommandArgv<C>
  ) {}

  protected abstract run(): Promise<void>
  protected bootstrap?(): Promise<void>
  protected teardown?(): Promise<void>

  protected setExitCode(exitCode: number): void {
    if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
      throw new Error(`Invalid command exit code: ${exitCode}`)
    }
    this._exitCode = exitCode
  }

  private get _cmdName(): string {
    return this.constructor.name
  }

  public async handler(): Promise<{ exitCode: number }> {
    let exitCode = 0
    try {
      if (this.bootstrap) {
        await this.bootstrap()
      }
      await this.run()
      exitCode = this._exitCode
    } catch (thrown) {
      const error = errors.BotpressCLIError.map(thrown)

      this.logger.error(error.message)
      this.logger.debug(`[${this._cmdName}] ${errors.BotpressCLIError.fullStack(error)}`)

      exitCode = 1
    } finally {
      if (this.teardown) {
        await this.teardown()
      }
    }

    return { exitCode }
  }
}
