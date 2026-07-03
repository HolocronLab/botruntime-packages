import { Context, ROOT_CONTEXT } from '@opentelemetry/api'
import { AsyncLocalStorage } from 'async_hooks'
import { AbstractAsyncHooksContextManager } from '@opentelemetry/context-async-hooks/build/src/AbstractAsyncHooksContextManager.js'

/**
 * We needed to fork this because we need "enterWith" for LLMz iteration tracking
 * DO NOT switch back to the original package unless "enterWith" is added there
 * */
export class AsyncLocalStorageContextManager extends AbstractAsyncHooksContextManager {
  private _asyncLocalStorage: AsyncLocalStorage<Context>

  constructor() {
    super()
    this._asyncLocalStorage = new AsyncLocalStorage()
  }

  active(): Context {
    return this._asyncLocalStorage.getStore() ?? ROOT_CONTEXT
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const cb = thisArg == null ? fn : fn.bind(thisArg)
    return this._asyncLocalStorage.run(context, cb as never, ...args)
  }

  enable(): this {
    return this
  }

  enterWith(context: Context): void {
    this._asyncLocalStorage.enterWith(context)
  }

  disable(): this {
    this._asyncLocalStorage.disable()
    return this
  }
}
