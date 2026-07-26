import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { describe, expect, it, vi } from 'vitest'
import { superviseChild } from './supervise-child'

describe('superviseChild', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('forwards %s by event name and preserves its exit code', async (signal, exitCode) => {
    const signals = new EventEmitter()
    const child = new EventEmitter() as ChildProcess
    Object.assign(child, {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    })

    const completed = superviseChild(child, { signals, forceKillMs: 10_000 })
    signals.emit(signal)

    expect(child.kill).toHaveBeenCalledWith(signal)
    child.emit('close', 0, null)
    await expect(completed).resolves.toBe(exitCode)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('escalates a repeated signal to SIGKILL', async () => {
    const signals = new EventEmitter()
    const child = new EventEmitter() as ChildProcess
    Object.assign(child, {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    })

    const completed = superviseChild(child, { signals, forceKillMs: 10_000 })
    signals.emit('SIGTERM')
    signals.emit('SIGTERM')

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
    child.emit('close', null, 'SIGKILL')
    await expect(completed).resolves.toBe(137)
  })
})
