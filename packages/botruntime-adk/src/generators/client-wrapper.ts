import { z } from '@holocronlab/botruntime-sdk'
import path from 'path'
import crypto from 'crypto'
import { readFile } from 'fs/promises'
import { AgentProject } from '../agent-project/agent-project.js'
import { ADK_VERSION, formatCode } from './utils.js'
import { createFile } from '../utils/fs.js'
import { BuiltInWorkflows } from '@holocronlab/botruntime-runtime/internal'

const { transforms } = z

function isBuiltinWorkflow(name: string): boolean {
  return !!Object.values(BuiltInWorkflows).find((x) => x.name === name)
}

export async function generateClientWrapper(project: AgentProject): Promise<void> {
  // Extract action types
  const actionTypes: Array<{ name: string; inputType: string; outputType: string }> = []

  for (const action of project.actions) {
    // Skip hidden actions
    if (action.definition.attributes?.visibility === 'hidden') {
      continue
    }

    try {
      if (action.path === '<adk:builtin>') {
        const inputType = action.definition.input
          ? transforms.fromJSONSchema(action.definition.input).toTypescriptType({ treatDefaultAsOptional: true })
          : '{}'
        const outputType = action.definition.output
          ? transforms.fromJSONSchema(action.definition.output).toTypescriptType()
          : '{}'
        actionTypes.push({
          name: action.definition.name,
          inputType,
          outputType,
        })
        continue
      }

      // Import the action module to get types
      const absolutePath = path.join(project.path, action.path)
      const actionModule = await import(`${absolutePath}?t=${Date.now()}`)
      const actionInstance = actionModule[action.export] || actionModule.default

      if (actionInstance && actionInstance.input && actionInstance.output) {
        const inputType = actionInstance.input.toTypescriptType
          ? actionInstance.input.toTypescriptType({ treatDefaultAsOptional: true })
          : 'any'
        const outputType = actionInstance.output.toTypescriptType ? actionInstance.output.toTypescriptType() : 'any'

        actionTypes.push({
          name: action.definition.name,
          inputType,
          outputType,
        })
      }
    } catch (error) {
      console.warn(`Warning: Could not process action ${action.definition.name}:`, error)
      actionTypes.push({
        name: action.definition.name,
        inputType: 'any',
        outputType: 'any',
      })
    }
  }

  // Extract workflow types
  const workflowTypes: Array<{ name: string; inputType: string; outputType: string }> = []

  for (const workflow of project.workflows) {
    try {
      if (isBuiltinWorkflow(workflow.definition.name)) {
        continue
      }

      const workflowPath = path.join(project.path, workflow.path)
      const workflowModule = await import(`${workflowPath}?t=${Date.now()}`)
      const workflowInstance = workflowModule[workflow.export] || workflowModule.default

      if (workflowInstance) {
        const inputType = workflowInstance.inputSchema
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema may have toTypescriptType from Zui
            (workflowInstance.inputSchema as any).toTypescriptType?.({ treatDefaultAsOptional: true }) || 'any'
          : '{}'

        const outputType = workflowInstance.outputSchema
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema may have toTypescriptType from Zui
            (workflowInstance.outputSchema as any).toTypescriptType?.() || 'any'
          : '{}'

        workflowTypes.push({
          name: workflow.definition.name,
          inputType,
          outputType,
        })
      }
    } catch (error) {
      console.warn(`Warning: Could not process workflow ${workflow.definition.name}:`, error)
    }
  }

  // Extract table types
  const tableTypes: Array<{
    name: string
    inputType: string
    outputType: string
  }> = []

  for (const table of project.tables) {
    try {
      const tablePath = path.join(project.path, table.path)
      const tableModule = await import(`${tablePath}?t=${Date.now()}`)
      const tableInstance = tableModule.default || tableModule[table.export]

      if (tableInstance && tableInstance.columns) {
        const inputColumns: string[] = []
        const outputColumns: string[] = ['id: number', 'createdAt: string', 'updatedAt: string']

        for (const [colName, colDef] of Object.entries(tableInstance.columns)) {
          let schema: unknown
          let computed = false

          if (typeof colDef === 'object' && colDef !== null && 'schema' in colDef) {
            const colDefRecord = colDef as Record<string, unknown>
            schema = colDefRecord.schema
            computed = (colDefRecord.computed as boolean) || false
          } else {
            schema = colDef
          }

          const schemaObj = schema as Record<string, unknown>
          const tsType =
            typeof schemaObj.toTypescriptType === 'function'
              ? schemaObj.toTypescriptType({ treatDefaultAsOptional: true })
              : 'any'

          if (!computed) {
            inputColumns.push(`${colName}: ${tsType}`)
          }
          outputColumns.push(`${colName}: ${tsType}`)
        }

        tableTypes.push({
          name: table.definition.name,
          inputType: `{ ${inputColumns.join('; ')} }`,
          outputType: `{ ${outputColumns.join('; ')} }`,
        })
      }
    } catch (error) {
      console.warn(`Warning: Could not process table ${table.definition.name}:`, error)
    }
  }

  // Generate the client wrapper code
  const content = `
// @ts-nocheck
////////////////////////////////////////////////////////
// DO NOT EDIT THIS FILE DIRECTLY
// This file is auto-generated from the Botpress ADK
// ADK Version: ${ADK_VERSION}
// Generated at: ${new Date().toISOString()}
////////////////////////////////////////////////////////

import type { Client, Workflow } from '@holocronlab/botruntime-client'

// Utility type to simplify complex types
type Simplify<T> = T extends (...args: infer A) => infer R
  ? (...args: SimplifyTuple<A>) => Simplify<R>
  : T extends Array<infer E>
    ? Array<Simplify<E>>
    : T extends ReadonlyArray<infer E>
      ? ReadonlyArray<Simplify<E>>
      : T extends Promise<infer R>
        ? Promise<Simplify<R>>
        : T extends Buffer
          ? Buffer
          : T extends object
            ? SimplifyObject<T>
            : T

type SimplifyTuple<T> = T extends [...infer A] ? { [K in keyof A]: Simplify<A[K]> } : never
type SimplifyObject<T extends object> = T extends infer O ? { [K in keyof O]: Simplify<O[K]> } : never

type GenericWorkflowInput = Record<string, any>
type GenericWorkflowOutput = Record<string, any>

type TypedWorkflow<TInput = GenericWorkflowInput, TOutput = GenericWorkflowOutput> = Simplify<
  Omit<Workflow, 'input' | 'output'> & {
    input: TInput
    output: TOutput
  }
>

// Extract response types from Client methods
type CreateWorkflowResponse = Simplify<Awaited<ReturnType<Client['createWorkflow']>>>
type GetWorkflowResponse = Simplify<Awaited<ReturnType<Client['getWorkflow']>>>
type UpdateWorkflowResponse = Simplify<Awaited<ReturnType<Client['updateWorkflow']>>>
type DeleteWorkflowResponse = Simplify<Awaited<ReturnType<Client['deleteWorkflow']>>>
type GetOrCreateWorkflowResponse = Simplify<Awaited<ReturnType<Client['getOrCreateWorkflow']>>>

type CreateTableRowsResponse = Simplify<Awaited<ReturnType<Client['createTableRows']>>>
type UpdateTableRowsResponse = Simplify<Awaited<ReturnType<Client['updateTableRows']>>>
type UpsertTableRowsResponse = Simplify<Awaited<ReturnType<Client['upsertTableRows']>>>
type DeleteTableRowsResponse = Simplify<Awaited<ReturnType<Client['deleteTableRows']>>>
type FindTableRowsResponse = Simplify<Awaited<ReturnType<Client['findTableRows']>>>
type GetTableRowResponse = Simplify<Awaited<ReturnType<Client['getTableRow']>>>

// Extract parameter types from Client methods
type ParamCreateWorkflow = Simplify<Parameters<Client['createWorkflow']>[0]>
type ParamGetWorkflow = Simplify<Parameters<Client['getWorkflow']>[0]>
type ParamUpdateWorkflow = Simplify<Parameters<Client['updateWorkflow']>[0]>
type ParamDeleteWorkflow = Simplify<Parameters<Client['deleteWorkflow']>[0]>
type ParamGetOrCreateWorkflow = Simplify<Parameters<Client['getOrCreateWorkflow']>[0]>

type ParamCreateTableRows = Simplify<Parameters<Client['createTableRows']>[0]>
type ParamUpdateTableRows = Simplify<Parameters<Client['updateTableRows']>[0]>
type ParamUpsertTableRows = Simplify<Parameters<Client['upsertTableRows']>[0]>
type ParamDeleteTableRows = Simplify<Parameters<Client['deleteTableRows']>[0]>
type ParamFindTableRows = Simplify<Parameters<Client['findTableRows']>[0]>
type ParamGetTableRow = Simplify<Parameters<Client['getTableRow']>[0]>

/**
 * Typed ADK Client
 *
 * Provides strongly-typed wrappers around the Botpress Client for actions, workflows, and tables.
 */
export interface AdkClient {
  /**
   * Typed action calls
   */
  actions: {
    ${actionTypes
      .map(
        (action) => `
    /**
     * Call action: ${action.name}
     */
    '${action.name}': (input: ${action.inputType}) => Promise<${action.outputType}>
    `
      )
      .join('\n')}
  }

  /**
   * Typed workflow operations
   */
  workflows: {
    ${workflowTypes
      .map(
        (workflow) => `
    '${workflow.name}': {
      /**
       * Create workflow: ${workflow.name}
       */
      createWorkflow: (params: Omit<ParamCreateWorkflow, 'name' | 'input'> & { input?: ${workflow.inputType} }) => Promise<Omit<CreateWorkflowResponse, 'workflow'> & { workflow: TypedWorkflow<${workflow.inputType}, ${workflow.outputType}> }>
      /**
       * Get workflow by ID
       */
      getWorkflow: (params: ParamGetWorkflow) => Promise<Omit<GetWorkflowResponse, 'workflow'> & { workflow: TypedWorkflow<${workflow.inputType}, ${workflow.outputType}> }>
      /**
       * Update workflow
       */
      updateWorkflow: (params: Omit<ParamUpdateWorkflow, 'output'> & { output?: ${workflow.outputType} }) => Promise<Omit<UpdateWorkflowResponse, 'workflow'> & { workflow: TypedWorkflow<${workflow.inputType}, ${workflow.outputType}> }>
      /**
       * Delete workflow
       */
      deleteWorkflow: (params: ParamDeleteWorkflow) => Promise<DeleteWorkflowResponse>
      /**
       * Get or create workflow with deduplication key
       */
      getOrCreateWorkflow: (params: Omit<ParamGetOrCreateWorkflow, 'name' | 'input'> & { input?: ${workflow.inputType} }) => Promise<Omit<GetOrCreateWorkflowResponse, 'workflow'> & { workflow: TypedWorkflow<${workflow.inputType}, ${workflow.outputType}> }>
    }
    `
      )
      .join('\n')}
  }

  /**
   * Typed table operations
   */
  tables: {
    ${tableTypes
      .map(
        (table) => `
    '${table.name}': {
      /**
       * Find rows in table: ${table.name}
       */
      findTableRows: (params?: Omit<ParamFindTableRows, 'table'>) => Promise<Omit<FindTableRowsResponse, 'rows'> & { rows: Array<${table.outputType}> }>
      /**
       * Get a single row by ID
       */
      getTableRow: (params: Omit<ParamGetTableRow, 'table'>) => Promise<Omit<GetTableRowResponse, 'row'> & { row: ${table.outputType} }>
      /**
       * Create rows in table: ${table.name}
       */
      createTableRows: (params: Omit<ParamCreateTableRows, 'table'>) => Promise<Omit<CreateTableRowsResponse, 'rows'> & { rows: Array<${table.outputType}> }>
      /**
       * Update rows in table: ${table.name}
       */
      updateTableRows: (params: Omit<ParamUpdateTableRows, 'table'>) => Promise<Omit<UpdateTableRowsResponse, 'rows'> & { rows: Array<${table.outputType}> }>
      /**
       * Upsert rows in table: ${table.name}
       */
      upsertTableRows: (params: Omit<ParamUpsertTableRows, 'table'>) => Promise<Omit<UpsertTableRowsResponse, 'rows'> & { rows: Array<${table.outputType}> }>
      /**
       * Delete rows by IDs
       */
      deleteTableRows: (params: Omit<ParamDeleteTableRows, 'table'>) => Promise<Omit<DeleteTableRowsResponse, 'rows'> & { rows: Array<${table.outputType}> }>
    }
    `
      )
      .join('\n')}
  }

  /**
   * Raw Botpress client (no additional typing)
   */
  client: Client
}

/**
 * Create a typed ADK client wrapper around a Botpress Client
 *
 * @example
 * \`\`\`typescript
 * import { Client } from '@holocronlab/botruntime-client'
 * import { createAdkClient } from './.adk/client'
 *
 * const client = new Client({ token: 'xxx', botId: 'yyy' })
 * const adk = createAdkClient(client)
 *
 * // Typed action calls
 * const result = await adk.actions.myAction({ foo: 'bar' })
 *
 * // Typed workflow operations
 * const wf = await adk.workflows.myWorkflow.createWorkflow({ input: { data: 'value' } })
 * const workflow = await adk.workflows.myWorkflow.getWorkflow({ id: wf.workflow.id })
 * await adk.workflows.myWorkflow.updateWorkflow({ id: wf.workflow.id, status: 'completed' })
 * await adk.workflows.myWorkflow.deleteWorkflow({ id: wf.workflow.id })
 * await adk.workflows.myWorkflow.getOrCreateWorkflow({ key: 'unique-key', input: { data: 'value' } })
 *
 * // Typed table operations
 * const rows = await adk.tables.myTable.findTableRows({ filter: { name: 'John' } })
 * const row = await adk.tables.myTable.getTableRow({ id: 123 })
 * await adk.tables.myTable.createTableRows({ rows: [{ name: 'Jane', age: 30 }] })
 * await adk.tables.myTable.updateTableRows({ rows: [{ id: 123, name: 'Jane' }] })
 * await adk.tables.myTable.upsertTableRows({ rows: [{ name: 'Bob', age: 25 }] })
 * await adk.tables.myTable.deleteTableRows({ ids: [123, 456] })
 * \`\`\`
 */
export function createAdkClient(client: Client): AdkClient {
  return {
    actions: {
      ${actionTypes
        .map(
          (action) => `
      '${action.name}': async (input: ${action.inputType}) => {
        const response = await client.callAction({
          type: '${action.name}',
          input,
        })
        return response.output as ${action.outputType}
      }
      `
        )
        .join(',\n')}
    },

    workflows: {
      ${workflowTypes
        .map(
          (workflow) => `
      '${workflow.name}': {
        createWorkflow: async (params) => {
          return client.createWorkflow({
            name: '${workflow.name}',
            ...params,
          }) as any
        },
        getWorkflow: async (params) => {
          return client.getWorkflow(params) as any
        },
        updateWorkflow: async (params) => {
          return client.updateWorkflow(params) as any
        },
        deleteWorkflow: async (params) => {
          return client.deleteWorkflow(params) as any
        },
        getOrCreateWorkflow: async (params) => {
          return client.getOrCreateWorkflow({
            name: '${workflow.name}',
            ...params,
          }) as any
        },
      }
      `
        )
        .join(',\n')}
    },

    tables: {
      ${tableTypes
        .map(
          (table) => `
      '${table.name}': {
        findTableRows: async (params) => {
          return client.findTableRows({
            table: '${table.name}',
            ...params,
          }) as any
        },
        getTableRow: async (params) => {
          return client.getTableRow({
            table: '${table.name}',
            ...params,
          }) as any
        },
        createTableRows: async (params) => {
          return client.createTableRows({
            table: '${table.name}',
            ...params,
          }) as any
        },
        updateTableRows: async (params) => {
          return client.updateTableRows({
            table: '${table.name}',
            ...params,
          }) as any
        },
        upsertTableRows: async (params) => {
          return client.upsertTableRows({
            table: '${table.name}',
            ...params,
          }) as any
        },
        deleteTableRows: async (params) => {
          return client.deleteTableRows({
            table: '${table.name}',
            ...params,
          }) as any
        },
      }
      `
        )
        .join(',\n')}
    },

    client,
  }
}
`

  // Write the client wrapper to .adk/client.ts
  const clientWrapperPath = path.join(project.path, '.adk', 'client.ts')
  const formattedContent = await formatCode(content)

  // Calculate hash of content without timestamp to detect actual changes
  const contentHash = crypto
    .createHash('sha256')
    .update(
      formattedContent
        // Remove the timestamp line for hash calculation
        .replace(/\/\/ Generated at: .+\n/, '')
    )
    .digest('hex')

  // Check if file exists and has the same content hash
  try {
    const existingContent = await readFile(clientWrapperPath, 'utf-8')
    const existingHash = crypto
      .createHash('sha256')
      .update(
        existingContent
          // Remove the timestamp line for hash calculation
          .replace(/\/\/ Generated at: .+\n/, '')
      )
      .digest('hex')

    // If content hasn't changed (ignoring timestamp), skip writing
    if (contentHash === existingHash) {
      return
    }
  } catch {
    // File doesn't exist or can't be read, proceed with writing
  }

  // Content has changed, write the file
  await createFile(clientWrapperPath, formattedContent)
}
