import { describe, expect, it, vi } from 'vitest'
import { AgentConfigSyncManager } from './agent-config-sync.js'

describe('AgentConfigSyncManager maxExecutionTime', () => {
  it('syncs maxExecutionTime from agent.config.ts', async () => {
    const updateBot = vi.fn().mockResolvedValue(undefined)
    const manager = new AgentConfigSyncManager({ updateBot } as never)

    await manager.syncFromConfig('42', { maxExecutionTime: 300 })

    expect(updateBot).toHaveBeenCalledWith({ id: '42', maxExecutionTime: 300 })
  })

  it('syncs a maxExecutionTime preflight diff', async () => {
    const updateBot = vi.fn().mockResolvedValue(undefined)
    const manager = new AgentConfigSyncManager({ updateBot } as never)

    await manager.syncFromChanges('42', [
      { field: 'maxExecutionTime', oldValue: 120, newValue: 300 },
    ])

    expect(updateBot).toHaveBeenCalledWith({ id: '42', maxExecutionTime: 300 })
  })
})
