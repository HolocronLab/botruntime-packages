import type { Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { describe, expect, it } from 'vitest'
import type { BotContext } from './context/context'
import { context } from './context/context'
import { TrackedState } from './tracked-state'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('TrackedState.save', () => {
  it('keeps a mutation dirty when it happens while an earlier snapshot is being persisted', async () => {
    const writeStarted = deferred()
    const allowWrite = deferred()
    const writes: unknown[] = []
    const client = {
      setState: async ({ payload }: { payload: unknown }) => {
        writes.push(structuredClone(payload))
        writeStarted.resolve()
        await allowWrite.promise
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-1',
        name: 'workflowSteps',
        schema: z.object({ revision: z.number() }),
        client,
      })

      state.value = { revision: 1 }
      state.markDirty()
      const firstSave = state.save()
      await writeStarted.promise

      state.value.revision = 2
      allowWrite.resolve()
      await firstSave

      expect(writes).toEqual([{ value: { revision: 1 }, location: { type: 'state' } }])
      expect(state.isDirty()).toBe(true)

      await state.save()

      expect(writes).toEqual([
        { value: { revision: 1 }, location: { type: 'state' } },
        { value: { revision: 2 }, location: { type: 'state' } },
      ])
      expect(state.isDirty()).toBe(false)
    })
  })

  it('coalesces a concurrent save behind the in-flight snapshot', async () => {
    const firstWriteStarted = deferred()
    const allowFirstWrite = deferred()
    const writes: unknown[] = []
    let activeWrites = 0
    let maxActiveWrites = 0
    const client = {
      setState: async ({ payload }: { payload: unknown }) => {
        activeWrites += 1
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites)
        writes.push(structuredClone(payload))
        if (writes.length === 1) {
          firstWriteStarted.resolve()
          await allowFirstWrite.promise
        }
        activeWrites -= 1
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-2',
        name: 'workflowSteps',
        schema: z.object({ revision: z.number() }),
        client,
      })

      state.value = { revision: 1 }
      state.markDirty()
      const firstSave = state.save()
      await firstWriteStarted.promise

      state.value.revision = 2
      state.markDirty()
      const secondSave = state.save()
      let secondSaveSettled = false
      void secondSave.finally(() => {
        secondSaveSettled = true
      })
      await Promise.resolve()
      expect(secondSaveSettled).toBe(false)

      allowFirstWrite.resolve()
      await Promise.all([firstSave, secondSave])

      expect(maxActiveWrites).toBe(1)
      expect(writes).toEqual([
        { value: { revision: 1 }, location: { type: 'state' } },
        { value: { revision: 2 }, location: { type: 'state' } },
      ])
      expect(state.isDirty()).toBe(false)
    })
  })
})
