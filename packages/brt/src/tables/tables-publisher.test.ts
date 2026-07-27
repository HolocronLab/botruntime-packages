import * as client from '@holocronlab/botruntime-client'
import * as sdk from '@holocronlab/botruntime-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TablesPublisher } from './tables-publisher'

const schema = sdk.z.object({
  eventKey: sdk.z.string(),
  payload: sdk.z.string().optional(),
})

const tableDefinition = (
  keyColumn: unknown = 'eventKey',
  keyColumnUnique = true
): sdk.BotTableDefinition =>
  ({
    schema,
    keyColumn,
    keyColumnUnique,
  }) as sdk.BotTableDefinition

const remoteTable = (
  state: 'disabled' | 'disabling' | 'enabled',
  {
    keyColumn = state === 'disabled' ? null : 'eventKey',
    unique = state === 'enabled',
  }: {
    keyColumn?: string | null
    unique?: boolean
  } = {}
) => ({
  id: 'AgentEventTable',
  name: 'AgentEventTable',
  factor: 1,
  frozen: false,
  keyColumn,
  keyColumnUnique: unique,
  keyColumnUniqueState: state,
  schema: sdk.z.transforms.toJSONSchemaLegacy(schema),
  tags: {},
  isComputeEnabled: true,
  createdAt: '2026-07-27T00:00:00Z',
  updatedAt: '2026-07-27T00:00:00Z',
})

const harness = (tables: ReturnType<typeof remoteTable>[]) => {
  const client = {
    createTable: vi.fn(),
    listTables: vi.fn(),
    transitionTableUniqueKey: vi.fn(),
    updateTable: vi.fn(),
  }
  const api = {
    client,
    safeListTables: vi.fn().mockResolvedValue({ success: true, tables }),
  }
  const rootApi = {
    switchBot: vi.fn().mockReturnValue(api),
  }
  const logger = {
    log: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  }
  const prompt = {
    confirm: vi.fn().mockResolvedValue(true),
  }
  const publisher = new TablesPublisher({
    api: rootApi as never,
    logger: logger as never,
    prompt: prompt as never,
    allowUniqueKeyTransitions: true,
  })
  const deploy = (definition: sdk.BotTableDefinition) =>
    publisher.deployTables({
      botId: '35',
      botDefinition: {
        tables: {
          AgentEventTable: definition,
        },
      } as unknown as sdk.BotDefinition,
    })

  return { api, client, deploy, logger, prompt, rootApi }
}

describe('TablesPublisher unique key contract', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the key, enables the physical contract, and only then reports success', async () => {
    const current = remoteTable('disabled')
    const { client, deploy, logger } = harness([current])
    client.updateTable.mockResolvedValue({
      table: remoteTable('disabled', { keyColumn: 'eventKey' }),
    })
    client.transitionTableUniqueKey.mockResolvedValue({
      table: remoteTable('enabled'),
    })

    await deploy(tableDefinition())

    expect(client.updateTable).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'AgentEventTable',
        keyColumn: 'eventKey',
      })
    )
    expect(client.transitionTableUniqueKey).toHaveBeenCalledWith({
      table: 'AgentEventTable',
      enabled: true,
    })
    expect(logger.success).toHaveBeenCalledWith(
      'Table "AgentEventTable" has been updated'
    )
    expect(
      client.transitionTableUniqueKey.mock.invocationCallOrder[0]
    ).toBeLessThan(logger.success.mock.invocationCallOrder[0]!)
  })

  it('normalizes the legacy object form and creates an enabled unique table', async () => {
    const { client, deploy } = harness([])
    client.createTable.mockResolvedValue({
      table: remoteTable('enabled'),
    })

    await deploy(tableDefinition({ name: 'eventKey', unique: true }, false))

    expect(client.createTable).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'AgentEventTable',
        keyColumn: 'eventKey',
        keyColumnUnique: true,
      })
    )
  })

  it('does not repeat the transition when the authoritative contract is already enabled', async () => {
    const current = remoteTable('enabled')
    const { client, deploy } = harness([current])
    client.updateTable.mockResolvedValue({ table: current })

    await deploy(tableDefinition())

    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
  })

  it('does not print success when the unique transition fails', async () => {
    const { client, deploy, logger } = harness([remoteTable('disabled')])
    client.updateTable.mockResolvedValue({
      table: remoteTable('disabled', { keyColumn: 'eventKey' }),
    })
    client.transitionTableUniqueKey.mockRejectedValue(
      new Error('TABLE_UNIQUE_STATE_CONFLICT')
    )

    await expect(deploy(tableDefinition())).rejects.toThrow(
      /TABLE_UNIQUE_STATE_CONFLICT/
    )
    expect(logger.success).not.toHaveBeenCalled()
  })

  it('recovers from a concurrent unique-state transition by waiting for its terminal state', async () => {
    const { client: apiClient, deploy } = harness([remoteTable('disabled')])
    apiClient.updateTable.mockResolvedValue({
      table: remoteTable('disabled', { keyColumn: 'eventKey' }),
    })
    apiClient.transitionTableUniqueKey.mockRejectedValue(
      new client.ResourceLockedConflictError(
        'table unique-key transition is already in progress',
        undefined,
        'unique-state-conflict',
        {
          errorCode: 'TABLE_UNIQUE_STATE_CONFLICT',
          retryable: false,
          recovery: 'wait_for_terminal_state',
        }
      )
    )
    apiClient.listTables.mockResolvedValue({
      tables: [remoteTable('enabled')],
    })

    await deploy(tableDefinition())

    expect(apiClient.transitionTableUniqueKey).toHaveBeenCalledOnce()
    expect(apiClient.listTables).toHaveBeenCalledOnce()
  })

  it('fails closed when a frozen table does not satisfy the declared key contract', async () => {
    const current = {
      ...remoteTable('disabled'),
      frozen: true,
    }
    const { client, deploy, logger } = harness([current])

    await expect(deploy(tableDefinition())).rejects.toThrow(
      /contract was not applied/
    )

    expect(client.updateTable).not.toHaveBeenCalled()
    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not disable the current unique contract when schema confirmation is rejected', async () => {
    const current = remoteTable('enabled')
    ;(current.schema.properties as Record<string, unknown>).legacy = {
      type: 'string',
      'x-zui': { index: 2 },
    }
    const { client, deploy, logger, prompt } = harness([current])
    prompt.confirm.mockResolvedValue(false)

    await deploy(tableDefinition('replacementKey'))

    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
    expect(client.updateTable).not.toHaveBeenCalled()
    expect(logger.success).not.toHaveBeenCalled()
  })

  it('waits for asynchronous disable before updating or reporting success', async () => {
    vi.useFakeTimers()
    const { client, deploy, logger } = harness([remoteTable('enabled')])
    client.transitionTableUniqueKey.mockResolvedValue({
      table: remoteTable('disabling', { unique: false }),
    })
    client.listTables
      .mockResolvedValueOnce({
        tables: [remoteTable('disabling', { unique: false })],
      })
      .mockResolvedValueOnce({
        tables: [remoteTable('disabled', { keyColumn: 'eventKey', unique: false })],
      })
    client.updateTable.mockResolvedValue({
      table: remoteTable('disabled', { keyColumn: 'eventKey', unique: false }),
    })

    const deploying = deploy(tableDefinition('eventKey', false))
    await vi.advanceTimersByTimeAsync(0)
    expect(client.updateTable).not.toHaveBeenCalled()
    expect(logger.success).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await deploying

    expect(client.updateTable).toHaveBeenCalledOnce()
    expect(logger.success).toHaveBeenCalledOnce()
  })

  it('keeps production sync verify-only when an existing key contract drifts', async () => {
    const current = remoteTable('disabled')
    const { client, logger, prompt, rootApi } = harness([current])
    const publisher = new TablesPublisher({
      api: rootApi as never,
      logger: logger as never,
      prompt: prompt as never,
    })

    await expect(
      publisher.deployTables({
        botId: '35',
        botDefinition: {
          tables: {
            AgentEventTable: tableDefinition(),
          },
        } as unknown as sdk.BotDefinition,
      })
    ).rejects.toThrow(/Direct unique-key transitions are allowed only for Development/)

    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
    expect(client.updateTable).not.toHaveBeenCalled()
  })

  it('keeps production sync verify-only when updateTable returns an incomplete key contract', async () => {
    const current = remoteTable('enabled')
    const { client, logger, prompt, rootApi } = harness([current])
    client.updateTable.mockResolvedValue({
      table: remoteTable('disabled', {
        keyColumn: 'eventKey',
        unique: false,
      }),
    })
    const publisher = new TablesPublisher({
      api: rootApi as never,
      logger: logger as never,
      prompt: prompt as never,
    })

    await expect(
      publisher.deployTables({
        botId: '35',
        botDefinition: {
          tables: {
            AgentEventTable: tableDefinition(),
          },
        } as unknown as sdk.BotDefinition,
      })
    ).rejects.toThrow(/contract was not applied/)

    expect(client.updateTable).toHaveBeenCalledOnce()
    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
  })

  it('does not create a production table with a key contract outside staged deployment', async () => {
    const { client, logger, prompt, rootApi } = harness([])
    const publisher = new TablesPublisher({
      api: rootApi as never,
      logger: logger as never,
      prompt: prompt as never,
    })

    await expect(
      publisher.deployTables({
        botId: '35',
        botDefinition: {
          tables: {
            AgentEventTable: tableDefinition(),
          },
        } as unknown as sdk.BotDefinition,
      })
    ).rejects.toThrow(/use the staged ADK deployment path for Production/)

    expect(client.createTable).not.toHaveBeenCalled()
    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
  })

  it('preflights every production key contract before updating any table', async () => {
    const ready = {
      ...remoteTable('enabled'),
      id: 'ReadyTable',
      name: 'ReadyTable',
    }
    const drifted = remoteTable('disabled')
    const { client, logger, prompt, rootApi } = harness([ready, drifted])
    const publisher = new TablesPublisher({
      api: rootApi as never,
      logger: logger as never,
      prompt: prompt as never,
    })

    await expect(
      publisher.deployTables({
        botId: '35',
        botDefinition: {
          tables: {
            ReadyTable: tableDefinition(),
            AgentEventTable: tableDefinition(),
          },
        } as unknown as sdk.BotDefinition,
      })
    ).rejects.toThrow(/AgentEventTable.*key contract differs/)

    expect(client.updateTable).not.toHaveBeenCalled()
    expect(client.transitionTableUniqueKey).not.toHaveBeenCalled()
  })

  it('fails closed when declared tables cannot be read before synchronization', async () => {
    const { api, client, deploy, logger } = harness([])
    api.safeListTables.mockResolvedValue({
      success: false,
      error: new Error('HTTP 401'),
    })

    await expect(deploy(tableDefinition())).rejects.toThrow(
      /table synchronization is fail-closed/
    )

    expect(client.createTable).not.toHaveBeenCalled()
    expect(client.updateTable).not.toHaveBeenCalled()
    expect(logger.success).not.toHaveBeenCalled()
  })
})
