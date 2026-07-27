import * as client from '@holocronlab/botruntime-client'
import * as sdk from '@holocronlab/botruntime-sdk'
import * as apiUtils from '../api'
import * as errors from '../errors'
import * as logger from '../logger'
import * as utils from '../utils'
import * as schemas from './schemas'
import {
  declaredTableKeyContract,
  tableKeyContractMatches,
  tableUniqueState,
} from './table-key-contract'

const UNIQUE_TRANSITION_POLL_INTERVAL_MS = 250
const UNIQUE_TRANSITION_TIMEOUT_MS = 60_000

export class TablesPublisher {
  private readonly _api: apiUtils.ApiClient
  private readonly _logger: logger.Logger
  private readonly _prompt: utils.prompt.CLIPrompt
  private readonly _allowUniqueKeyTransitions: boolean

  public constructor({
    api,
    logger,
    prompt,
    allowUniqueKeyTransitions = false,
  }: {
    api: apiUtils.ApiClient
    logger: logger.Logger
    prompt: utils.prompt.CLIPrompt
    allowUniqueKeyTransitions?: boolean
  }) {
    this._api = api
    this._logger = logger
    this._prompt = prompt
    this._allowUniqueKeyTransitions = allowUniqueKeyTransitions
  }

  public async deployTables({ botId, botDefinition }: { botId: string; botDefinition: sdk.BotDefinition }) {
    const api = this._api.switchBot(botId)

    this._logger.log('Synchronizing tables...')

    const tablesFromBotDef = Object.entries(botDefinition.tables ?? {})
    const listTableResult = await api.safeListTables({})

    if (!listTableResult.success) {
      if (tablesFromBotDef.length > 0) {
        throw errors.BotpressCLIError.wrap(
          listTableResult.error,
          'Could not verify declared tables; table synchronization is fail-closed'
        )
      }
      this._logger.warn('Tables API is not available, skipping table deployment.')
      return
    }

    const { tables: existingTables } = listTableResult
    if (!this._allowUniqueKeyTransitions) {
      this._preflightProductionKeyContracts(tablesFromBotDef, existingTables)
    }
    for (const [tableName, tableDef] of tablesFromBotDef) {
      const existingTable = existingTables.find((t) => t.name === tableName)

      this._logger.log(`Deploying table "${tableName}"...`)

      if (existingTable) {
        await this._deployExistingTable({ api, existingTable, updatedTableDef: tableDef })
      } else {
        await this._deployNewTable({ api, tableName, tableDef })
      }
    }

    for (const existingTable of existingTables) {
      if (!tablesFromBotDef.find(([tableName]) => tableName === existingTable.name)) {
        this._logger.log(
          `Table "${existingTable.name}" was previously defined but is not present in your bot definition. ` +
            'This table will be ignored. ' +
            'If you wish to delete this table, you may do so from the studio.'
        )
      }
    }
  }

  private _preflightProductionKeyContracts(
    declaredTables: Array<[string, sdk.BotTableDefinition]>,
    existingTables: Awaited<
      ReturnType<apiUtils.ApiClient['client']['listTables']>
    >['tables']
  ): void {
    for (const [tableName, tableDef] of declaredTables) {
      const expected = declaredTableKeyContract(tableDef)
      const existing = existingTables.find((table) => table.name === tableName)
      if (!existing) {
        if (expected.keyColumn !== null || expected.unique) {
          throw new errors.BotpressCLIError(
            `Table "${tableName}" declares a key contract that is not present yet. ` +
              'Direct unique-key transitions are allowed only for Development; use the staged ADK deployment path for Production.'
          )
        }
        continue
      }
      if (!tableKeyContractMatches(existing, expected)) {
        throw new errors.BotpressCLIError(
          `Table "${tableName}" key contract differs from the declaration. ` +
            'Direct unique-key transitions are allowed only for Development; use the staged ADK deployment path for Production.'
        )
      }
    }
  }

  private async _deployExistingTable({
    api,
    existingTable,
    updatedTableDef,
  }: {
    api: apiUtils.ApiClient
    existingTable: Awaited<ReturnType<apiUtils.ApiClient['client']['listTables']>>['tables'][number]
    updatedTableDef: sdk.BotTableDefinition
  }) {
    const {
      keyColumn: desiredKeyColumn,
      unique: desiredUnique,
    } = declaredTableKeyContract(updatedTableDef)

    if (existingTable.frozen) {
      this._assertUniqueContract(existingTable, {
        tableName: existingTable.name,
        keyColumn: desiredKeyColumn,
        unique: desiredUnique,
      })
      this._logger.warn(`Table "${existingTable.name}" is frozen and will not be updated.`)
      return
    }

    const remoteKeyColumn = existingTable.keyColumn ?? null
    let remoteUniqueState = tableUniqueState(existingTable)

    if (!this._allowUniqueKeyTransitions) {
      const expected = {
        tableName: existingTable.name,
        keyColumn: desiredKeyColumn,
        unique: desiredUnique,
      }
      if (!tableKeyContractMatches(existingTable, expected)) {
        throw new errors.BotpressCLIError(
          `Table "${existingTable.name}" key contract differs from the declaration. ` +
            'Direct unique-key transitions are allowed only for Development; use the staged ADK deployment path for Production.'
        )
      }
    }

    if (remoteUniqueState === 'enabling' || remoteUniqueState === 'disabling') {
      const terminal = remoteUniqueState === 'enabling' ? 'enabled' : 'disabled'
      const settled = await this._waitForUniqueState(api, existingTable.name, terminal)
      remoteUniqueState = tableUniqueState(settled)
    }

    const mustDisableBeforeUpdate =
      remoteUniqueState === 'error' ||
      (remoteUniqueState === 'enabled' &&
        (!desiredUnique || remoteKeyColumn !== desiredKeyColumn))

    const existingColumns = existingTable.schema.properties
    const updatedColumns = await this._parseTableColumns({ tableName: existingTable.name, tableDef: updatedTableDef })

    for (const [columnName, existingColumn] of Object.entries(existingColumns)) {
      const updatedColumn = updatedColumns[columnName]

      if (!updatedColumn) {
        const wishToContinue = await this._warnAndConfirm(
          `Column "${columnName}" is missing from the schema of table "${existingTable.name}" in your bot definition. ` +
            'If you are attempting to rename this column, please do so from the studio. ' +
            'Renaming a column in your bot definition will cause a new column to be created. ' +
            'If this is not a rename and you wish to proceed, the old column will be kept unchanged. ' +
            'You can delete columns from the studio if you no longer need them.'
        )

        // TODO: ask the user whether this is a rename. If it is a rename, list
        //       all other columns and ask which one has the new name, then do
        //       the rename operation with client.renameTableColumn()

        if (!wishToContinue) {
          return
        }
      }

      if (updatedColumn && existingColumn.type !== updatedColumn.type) {
        const wishToContinue = await this._warnAndConfirm(
          'DATA LOSS WARNING: ' +
            `Type of column "${columnName}" has changed from "${existingColumn.type}" to "${updatedColumn.type}" in table "${existingTable.name}". ` +
            'If you proceed, the value of this column will be reset to NULL for all rows in the table.'
        )

        if (!wishToContinue) {
          return
        }
      }
    }

    if (mustDisableBeforeUpdate) {
      await this._transitionUniqueKey(api, existingTable.name, false)
    }

    const updated = await api.client.updateTable({
      table: existingTable.name,
      schema: sdk.z.transforms.toJSONSchemaLegacy(updatedTableDef.schema),
      frozen: updatedTableDef.frozen,
      tags: updatedTableDef.tags,
      isComputeEnabled: updatedTableDef.isComputeEnabled,
      keyColumn: desiredKeyColumn,
    })

    let authoritative = updated.table
    if (desiredUnique && tableUniqueState(authoritative) !== 'enabled') {
      authoritative = await this._transitionUniqueKey(api, existingTable.name, true)
    }
    this._assertUniqueContract(authoritative, {
      tableName: existingTable.name,
      keyColumn: desiredKeyColumn,
      unique: desiredUnique,
    })

    this._logger.success(`Table "${existingTable.name}" has been updated`)
  }

  private async _transitionUniqueKey(
    api: apiUtils.ApiClient,
    tableName: string,
    enabled: boolean
  ) {
    const expectedState = enabled ? 'enabled' : 'disabled'
    const deadline = Date.now() + UNIQUE_TRANSITION_TIMEOUT_MS
    let lastState = 'unknown'

    while (Date.now() < deadline) {
      let table
      try {
        ;({ table } = await api.client.transitionTableUniqueKey({
          table: tableName,
          enabled,
        }))
      } catch (thrown) {
        if (!this._isUniqueStateConflict(thrown)) {
          throw thrown
        }
        table = await this._waitForUniqueTerminalState(api, tableName, deadline)
      }

      lastState = tableUniqueState(table)
      if (lastState === expectedState) {
        return table
      }
      if (lastState === 'enabling' || lastState === 'disabling') {
        table = await this._waitForUniqueTerminalState(api, tableName, deadline)
        lastState = tableUniqueState(table)
        if (lastState === expectedState) {
          return table
        }
      }
    }

    throw new errors.BotpressCLIError(
      `Table "${tableName}" did not reach unique key state "${expectedState}" within ` +
        `${UNIQUE_TRANSITION_TIMEOUT_MS / 1000}s (last state: "${lastState}").`
    )
  }

  private async _waitForUniqueState(
    api: apiUtils.ApiClient,
    tableName: string,
    expectedState: 'enabled' | 'disabled'
  ) {
    const deadline = Date.now() + UNIQUE_TRANSITION_TIMEOUT_MS
    const table = await this._waitForUniqueTerminalState(api, tableName, deadline)
    const lastState = tableUniqueState(table)
    if (lastState === expectedState) {
      return table
    }
    throw new errors.BotpressCLIError(
      `Table "${tableName}" did not reach unique key state "${expectedState}" within ` +
        `${UNIQUE_TRANSITION_TIMEOUT_MS / 1000}s (last state: "${lastState}").`
    )
  }

  private async _waitForUniqueTerminalState(
    api: apiUtils.ApiClient,
    tableName: string,
    deadline: number
  ) {
    while (Date.now() < deadline) {
      const { tables } = await api.client.listTables({})
      const table = tables.find((candidate) => candidate.name === tableName)
      if (!table) {
        throw new errors.BotpressCLIError(
          `Table "${tableName}" disappeared while waiting for a terminal unique key state.`
        )
      }
      const state = tableUniqueState(table)
      if (state === 'enabled' || state === 'disabled') {
        return table
      }
      if (state === 'error') {
        throw new errors.BotpressCLIError(
          `Table "${tableName}" entered unique key state "error".`
        )
      }
      await new Promise((resolve) =>
        setTimeout(resolve, UNIQUE_TRANSITION_POLL_INTERVAL_MS)
      )
    }
    throw new errors.BotpressCLIError(
      `Table "${tableName}" did not reach a terminal unique key state within ` +
        `${UNIQUE_TRANSITION_TIMEOUT_MS / 1000}s.`
    )
  }

  private _isUniqueStateConflict(thrown: unknown): boolean {
    if (
      !client.isApiError(thrown) ||
      thrown.code !== 409 ||
      typeof thrown.metadata !== 'object' ||
      thrown.metadata === null
    ) {
      return false
    }
    const metadata = thrown.metadata as Record<string, unknown>
    return (
      metadata.errorCode === 'TABLE_UNIQUE_STATE_CONFLICT' &&
      metadata.recovery === 'wait_for_terminal_state'
    )
  }

  private _assertUniqueContract(
    table: {
      keyColumn?: string | null
      keyColumnUnique?: boolean
      keyColumnUniqueState?: string
    },
    expected: {
      tableName: string
      keyColumn: string | null
      unique: boolean
    }
  ): void {
    if (tableKeyContractMatches(table, expected)) {
      return
    }
    const actualKeyColumn = table.keyColumn ?? null
    const actualUnique = table.keyColumnUnique ?? false
    const actualState = tableUniqueState(table)
    const expectedState = expected.unique ? 'enabled' : 'disabled'
    throw new errors.BotpressCLIError(
      `Table "${expected.tableName}" contract was not applied: ` +
        `expected keyColumn=${JSON.stringify(expected.keyColumn)}, unique=${expected.unique}, state=${expectedState}; ` +
        `received keyColumn=${JSON.stringify(actualKeyColumn)}, unique=${actualUnique}, state=${actualState}.`
    )
  }

  private async _parseTableColumns({
    tableName,
    tableDef,
  }: {
    tableName: string
    tableDef: sdk.BotTableDefinition
  }): Promise<Record<string, sdk.z.infer<typeof schemas.columnSchema>>> {
    const columns = sdk.z.transforms.toJSONSchemaLegacy(tableDef.schema).properties!

    const validColumns = await Promise.all(
      Object.entries(columns).map(async ([columnName, columnSchema]) => {
        const validatedSchema = await schemas.columnSchema.safeParseAsync(columnSchema)

        if (!validatedSchema.success) {
          throw new errors.BotpressCLIError(
            `Column "${columnName}" in table "${tableName}" has an invalid schema: ${validatedSchema.error.message}`
          )
        }

        return [columnName, validatedSchema.data] as const
      })
    )

    return Object.fromEntries(validColumns)
  }

  private async _warnAndConfirm(warningMessage: string, confirmMessage: string = 'Are you sure you want to continue?') {
    this._logger.warn(warningMessage)

    const confirm = await this._prompt.confirm(confirmMessage)

    if (!confirm) {
      this._logger.log('Aborted')
      return false
    }
    return true
  }

  private async _deployNewTable({
    api,
    tableName,
    tableDef,
  }: {
    api: apiUtils.ApiClient
    tableName: string
    tableDef: sdk.BotTableDefinition
  }) {
    const {
      keyColumn: desiredKeyColumn,
      unique: desiredUnique,
    } = declaredTableKeyContract(tableDef)
    if (
      !this._allowUniqueKeyTransitions &&
      (desiredKeyColumn !== null || desiredUnique)
    ) {
      throw new errors.BotpressCLIError(
        `Table "${tableName}" declares a key contract that is not present yet. ` +
          'Direct unique-key transitions are allowed only for Development; use the staged ADK deployment path for Production.'
      )
    }
    const { table } = await api.client.createTable({
      name: tableName,
      schema: sdk.z.transforms.toJSONSchemaLegacy(tableDef.schema),
      frozen: tableDef.frozen,
      tags: tableDef.tags,
      factor: tableDef.factor,
      isComputeEnabled: tableDef.isComputeEnabled,
      ...(this._allowUniqueKeyTransitions
        ? {
            keyColumn: desiredKeyColumn,
            keyColumnUnique: desiredUnique,
          }
        : {}),
    })

    this._assertUniqueContract(table, {
      tableName,
      keyColumn: desiredKeyColumn,
      unique: desiredUnique,
    })

    this._logger.success(`Table "${tableName}" has been created`)
  }
}
