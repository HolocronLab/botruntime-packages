import { ResourceLockedConflictError, type Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
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
	it('swaps oversized state without requesting unsupported file expiry', async () => {
		const uploads: Record<string, unknown>[] = []
		const writes: unknown[] = []
		const client = {
			uploadFile: async (input: Record<string, unknown>) => {
				uploads.push(input)
				return { file: { id: 'file_swap_1' } }
			},
			setState: async ({ payload }: { payload: unknown }) => {
				writes.push(payload)
			},
		} as unknown as Client

		await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
			const state = TrackedState.create({
				type: 'workflow',
				id: 'workflow-large',
				name: 'workflowSteps',
				schema: z.object({ content: z.string() }),
				client,
			})
			state.value = { content: 'x'.repeat(140_000) }
			state.markDirty()

			await state.save()
		})

		expect(uploads).toHaveLength(1)
		expect(uploads[0]).not.toHaveProperty('expiresAt')
		expect(uploads[0]?.key).toMatch(
			/^swap\/state\/v2\/[0-9a-f]{64}\/legacy\/[0-9a-f]{64}\.json$/
		)
		expect(writes).toEqual([{ value: undefined, location: { type: 'file', key: 'file_swap_1' } }])
	})

  it('does not let a losing CAS writer overwrite the winning swapped snapshot', async () => {
    const files = new Map<string, string>()
    const uploadKeys: string[] = []
    const deletedIds: string[] = []
    let authoritativeVersion = 41
    let authoritativePayload: unknown = {
      value: { content: 'initial' },
      location: { type: 'state' },
    }

    const createClient = () =>
      ({
        getOrSetState: async () => ({
          state: {
            version: authoritativeVersion,
            payload: structuredClone(authoritativePayload),
          },
        }),
        getState: async () => ({
          state: {
            version: authoritativeVersion,
            payload: structuredClone(authoritativePayload),
          },
        }),
        uploadFile: async ({ key, content }: { key: string; content: string }) => {
          uploadKeys.push(key)
          files.set(key, content)
          return { file: { id: key } }
        },
        deleteFile: async ({ id }: { id: string }) => {
          deletedIds.push(id)
          files.delete(id)
        },
        setState: async ({
          expectedVersion,
          payload,
        }: {
          expectedVersion?: number
          payload: unknown
        }) => {
          if (expectedVersion !== authoritativeVersion) {
            throw new ResourceLockedConflictError('state version conflict')
          }
          authoritativePayload = structuredClone(payload)
          authoritativeVersion++
          return { state: { version: authoritativeVersion } }
        },
      }) as unknown as Client

    const startWriter = (content: string) => {
      const loaded = deferred()
      const allowSave = deferred()
      const promise = context.run(
        { states: [], executionFinished: false } as unknown as BotContext,
        async () => {
          const state = TrackedState.create({
            type: 'workflow',
            id: 'workflow-shared',
            name: 'workflowSteps',
            schema: z.object({ content: z.string() }),
            client: createClient(),
          })

          await state.load()
          state.value = { content }
          state.markDirty()
          loaded.resolve()
          await allowSave.promise
          await state.save()
        }
      )
      return { loaded: loaded.promise, allowSave, promise }
    }

    const winnerContent = 'a'.repeat(140_000)
    const loserContent = 'b'.repeat(140_000)
    const writerA = startWriter(winnerContent)
    const writerB = startWriter(loserContent)

    await Promise.all([writerA.loaded, writerB.loaded])
    writerA.allowSave.resolve()
    await writerA.promise

    const losingSave = expect(writerB.promise).rejects.toBeInstanceOf(ResourceLockedConflictError)
    writerB.allowSave.resolve()
    await losingSave

    expect(uploadKeys).toHaveLength(2)
    expect(uploadKeys[0]).not.toBe(uploadKeys[1])
    expect(uploadKeys.every((key) =>
      /^swap\/state\/v2\/[0-9a-f]{64}\/version-41\/[0-9a-f]{64}\.json$/.test(key)
    )).toBe(true)
    expect(deletedIds).toEqual([uploadKeys[1]])

    const winnerLocation = (authoritativePayload as { location: { type: string; key: string } }).location
    expect(winnerLocation.type).toBe('file')
    expect(files.get(winnerLocation.key)).toBe(JSON.stringify({ content: winnerContent }))
    expect(files.has(uploadKeys[1]!)).toBe(false)
  })

  it('retains a shared swap file when same-content CAS contenders use the same key', async () => {
    const files = new Map<string, string>()
    const uploadKeys: string[] = []
    const deletedIds: string[] = []
    let authoritativeVersion = 51
    let authoritativePayload: unknown = {
      value: { content: 'initial' },
      location: { type: 'state' },
    }

    const createClient = () =>
      ({
        getOrSetState: async () => ({
          state: {
            version: authoritativeVersion,
            payload: structuredClone(authoritativePayload),
          },
        }),
        getState: async () => ({
          state: {
            version: authoritativeVersion,
            payload: structuredClone(authoritativePayload),
          },
        }),
        uploadFile: async ({ key, content }: { key: string; content: string }) => {
          uploadKeys.push(key)
          files.set(key, content)
          return { file: { id: key } }
        },
        deleteFile: async ({ id }: { id: string }) => {
          deletedIds.push(id)
          files.delete(id)
        },
        setState: async ({
          expectedVersion,
          payload,
        }: {
          expectedVersion?: number
          payload: unknown
        }) => {
          if (expectedVersion !== authoritativeVersion) {
            throw new ResourceLockedConflictError('state version conflict')
          }
          authoritativePayload = structuredClone(payload)
          authoritativeVersion++
          return { state: { version: authoritativeVersion } }
        },
      }) as unknown as Client

    const startWriter = () => {
      const loaded = deferred()
      const allowSave = deferred()
      const promise = context.run(
        { states: [], executionFinished: false } as unknown as BotContext,
        async () => {
          const state = TrackedState.create({
            type: 'workflow',
            id: 'workflow-same-content',
            name: 'workflowSteps',
            schema: z.object({ content: z.string() }),
            client: createClient(),
          })

          await state.load()
          state.value = { content: 'x'.repeat(140_000) }
          state.markDirty()
          loaded.resolve()
          await allowSave.promise
          await state.save()
        }
      )
      return { loaded: loaded.promise, allowSave, promise }
    }

    const writerA = startWriter()
    const writerB = startWriter()
    await Promise.all([writerA.loaded, writerB.loaded])

    writerA.allowSave.resolve()
    await writerA.promise
    const losingSave = expect(writerB.promise).rejects.toBeInstanceOf(ResourceLockedConflictError)
    writerB.allowSave.resolve()
    await losingSave

    expect(uploadKeys).toHaveLength(2)
    expect(uploadKeys[0]).toBe(uploadKeys[1])
    expect(deletedIds).toEqual([])
    const winnerLocation = (authoritativePayload as { location: { key: string } }).location
    expect(files.has(winnerLocation.key)).toBe(true)
  })

  it('uses the server-issued version in swap keys so ABA content does not reuse a generation', async () => {
    const uploads: string[] = []
    const deletes: string[] = []
    const writes: Array<Record<string, unknown>> = []
    const issuedVersions = [83, 101, 144]
    let authoritativeVersion = 70
    const client = {
      getOrSetState: async () => ({
        state: {
          version: authoritativeVersion,
          payload: { value: { content: 'initial' }, location: { type: 'state' } },
        },
      }),
      uploadFile: async ({ key }: { key: string }) => {
        uploads.push(key)
        return { file: { id: key } }
      },
      deleteFile: async ({ id }: { id: string }) => {
        deletes.push(id)
      },
      setState: async (input: Record<string, unknown>) => {
        expect(input.expectedVersion).toBe(authoritativeVersion)
        writes.push(structuredClone(input))
        authoritativeVersion = issuedVersions[writes.length - 1]!
        return { state: { version: authoritativeVersion } }
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-aba',
        name: 'workflowSteps',
        schema: z.object({ content: z.string() }),
        client,
      })
      await state.load()

      for (const marker of ['a', 'b', 'a']) {
        state.value = { content: marker.repeat(140_000) }
        state.markDirty()
        await state.save()
      }
    })

    expect(writes.map((write) => write.expectedVersion)).toEqual([70, 83, 101])
    expect(uploads).toHaveLength(3)
    expect(uploads[0]).toMatch(/\/version-70\//)
    expect(uploads[1]).toMatch(/\/version-83\//)
    expect(uploads[2]).toMatch(/\/version-101\//)
    expect(uploads[0]).not.toBe(uploads[2])
    expect(deletes).toEqual(uploads.slice(0, 2))
  })

  it('uses different swap keys for different state names', async () => {
    const keys: string[] = []
    const client = {
      uploadFile: async ({ key }: { key: string }) => {
        keys.push(key)
        return { file: { id: key } }
      },
      setState: async () => ({ state: { version: 1 } }),
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const content = 'x'.repeat(140_000)
      const first = TrackedState.create({
        type: 'workflow',
        id: 'workflow/shared',
        name: 'workflowSteps',
        schema: z.object({ content: z.string() }),
        client,
      })
      const second = TrackedState.create({
        type: 'workflow',
        id: 'workflow/shared',
        name: 'workflowCache',
        schema: z.object({ content: z.string() }),
        client,
      })

      first.value = { content }
      first.markDirty()
      second.value = { content }
      second.markDirty()
      await first.save()
      await second.save()
    })

    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    expect(keys.every((key) =>
      /^swap\/state\/v2\/[0-9a-f]{64}\/legacy\/[0-9a-f]{64}\.json$/.test(key)
    )).toBe(true)
  })

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

  it('recovers once when an old swap pointer is deleted between the state read and file fetch', async () => {
    const oldFileId = 'file_old_generation'
    const newFileId = 'file_new_generation'
    const fileReads: string[] = []
    const writes: Array<Record<string, unknown>> = []
    let refreshes = 0
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { revision: 2 },
    })
    const client = {
      getOrSetState: async () => ({
        state: {
          version: 10,
          payload: { value: undefined, location: { type: 'file', key: oldFileId } },
        },
      }),
      getState: async () => {
        refreshes++
        return {
          state: {
            version: 11,
            payload: { value: undefined, location: { type: 'file', key: newFileId } },
          },
        }
      },
      getFile: async ({ id }: { id: string }) => {
        fileReads.push(id)
        if (id === oldFileId) throw new Error('old swap file was deleted')
        return {
          file: {
            id,
            key: 'not-a-runtime-owned-swap-key',
            url: 'https://files.invalid/new-generation',
          },
        }
      },
      setState: async (input: Record<string, unknown>) => {
        writes.push(structuredClone(input))
        return { state: { version: 12 } }
      },
    } as unknown as Client

    try {
      await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
        const state = TrackedState.create({
          type: 'workflow',
          id: 'workflow-reader-race',
          name: 'workflowSteps',
          schema: z.object({ revision: z.number() }),
          client,
        })

        await state.load()
        expect(state.value).toEqual({ revision: 2 })
        expect(writes).toEqual([])

        state.value!.revision = 3
        state.markDirty()
        await state.save()
      })
    } finally {
      get.mockRestore()
    }

    expect(refreshes).toBe(1)
    expect(fileReads).toEqual([oldFileId, newFileId])
    expect(writes).toHaveLength(1)
    expect(writes[0]?.expectedVersion).toBe(11)
  })

  it('does not replay a successful CAS save when superseded-file deletion fails', async () => {
    const uploads: string[] = []
    const deleteAttempts: string[] = []
    const writes: Array<Record<string, unknown>> = []
    let authoritativeVersion = 12
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = {
      getOrSetState: async () => ({
        state: {
          version: authoritativeVersion,
          payload: { value: { content: 'initial' }, location: { type: 'state' } },
        },
      }),
      uploadFile: async ({ key }: { key: string }) => {
        uploads.push(key)
        return { file: { id: key } }
      },
      setState: async (input: Record<string, unknown>) => {
        writes.push(structuredClone(input))
        expect(input.expectedVersion).toBe(authoritativeVersion)
        authoritativeVersion++
        return { state: { version: authoritativeVersion } }
      },
      deleteFile: async ({ id }: { id: string }) => {
        deleteAttempts.push(id)
        throw new Error('delete unavailable')
      },
    } as unknown as Client

    try {
      await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
        const state = TrackedState.create({
          type: 'workflow',
          id: 'workflow-delete-failure',
          name: 'workflowSteps',
          schema: z.object({ content: z.string() }),
          client,
        })
        await state.load()

        state.value = { content: 'a'.repeat(140_000) }
        state.markDirty()
        await state.save()
        state.value = { content: 'b'.repeat(140_000) }
        state.markDirty()
        await state.save()

        expect(state.isDirty()).toBe(false)
      })
    } finally {
      warn.mockRestore()
    }

    expect(writes.map((write) => write.expectedVersion)).toEqual([12, 13])
    expect(writes).toHaveLength(2)
    expect(deleteAttempts).toEqual([uploads[0]])
  })

  it('keeps legacy oversized saves content-addressed and skips unsafe cleanup without versions', async () => {
    const uploads: string[] = []
    const deletes: string[] = []
    const writes: Array<Record<string, unknown>> = []
    const client = {
      getOrSetState: async () => ({
        state: {
          payload: { value: { content: 'initial' }, location: { type: 'state' } },
        },
      }),
      uploadFile: async ({ key }: { key: string }) => {
        uploads.push(key)
        return { file: { id: key } }
      },
      setState: async (input: Record<string, unknown>) => {
        writes.push(structuredClone(input))
        return { state: {} }
      },
      deleteFile: async ({ id }: { id: string }) => {
        deletes.push(id)
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-legacy-swap',
        name: 'workflowSteps',
        schema: z.object({ content: z.string() }),
        client,
      })
      await state.load()

      for (const marker of ['a', 'b']) {
        state.value = { content: marker.repeat(140_000) }
        state.markDirty()
        await state.save()
      }
    })

    expect(uploads).toHaveLength(2)
    expect(uploads[0]).not.toBe(uploads[1])
    expect(uploads.every((key) =>
      /^swap\/state\/v2\/[0-9a-f]{64}\/legacy\/[0-9a-f]{64}\.json$/.test(key)
    )).toBe(true)
    expect(writes.every((write) => !Object.hasOwn(write, 'expectedVersion'))).toBe(true)
    expect(deletes).toEqual([])
  })

  it('echoes the server-issued version and advances it after every successful save', async () => {
    const writes: Array<Record<string, unknown>> = []
    const client = {
      getOrSetState: async () => ({
        state: {
          version: 17,
          payload: { value: { revision: 0 }, location: { type: 'state' } },
        },
      }),
      setState: async (input: Record<string, unknown>) => {
        writes.push(structuredClone(input))
        return { state: { version: writes.length === 1 ? 23 : 29 } }
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-cas',
        name: 'workflowSteps',
        schema: z.object({ revision: z.number() }),
        client,
      })

      await state.load()
      state.value!.revision = 1
      state.markDirty()
      await state.save()

      state.value!.revision = 2
      state.markDirty()
      await state.save()
    })

    expect(writes.map((write) => write.expectedVersion)).toEqual([17, 23])
  })

  it('omits expectedVersion when a legacy server omits state versions', async () => {
    const writes: Array<Record<string, unknown>> = []
    const client = {
      getOrSetState: async () => ({
        state: {
          payload: { value: { revision: 0 }, location: { type: 'state' } },
        },
      }),
      setState: async (input: Record<string, unknown>) => {
        writes.push(structuredClone(input))
        return { state: {} }
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-legacy',
        name: 'workflowSteps',
        schema: z.object({ revision: z.number() }),
        client,
      })

      await state.load()
      state.value!.revision = 1
      state.markDirty()
      await state.save()
      state.value!.revision = 2
      state.markDirty()
      await state.save()
    })

    expect(writes).toHaveLength(2)
    expect(writes.every((write) => !Object.hasOwn(write, 'expectedVersion'))).toBe(true)
  })

  it('surfaces a state version conflict without replaying the stale write', async () => {
    const conflict = new ResourceLockedConflictError('state version conflict')
    let writeCount = 0
    const client = {
      getOrSetState: async () => ({
        state: {
          version: 31,
          payload: { value: { revision: 0 }, location: { type: 'state' } },
        },
      }),
      setState: async () => {
        writeCount++
        throw conflict
      },
    } as unknown as Client

    await context.run({ states: [], executionFinished: false } as unknown as BotContext, async () => {
      const state = TrackedState.create({
        type: 'workflow',
        id: 'workflow-conflict',
        name: 'workflowSteps',
        schema: z.object({ revision: z.number() }),
        client,
      })

      await state.load()
      state.value!.revision = 1
      state.markDirty()

      await expect(TrackedState.saveAllDirty()).rejects.toBe(conflict)
      await expect(TrackedState.saveAllDirty()).rejects.toBe(conflict)
      expect(state.isDirty()).toBe(true)
    })

    expect(writeCount).toBe(1)
  })
})
