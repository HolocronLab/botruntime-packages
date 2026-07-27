import * as common from '../common'
import * as gen from '../gen/tables'
import * as atomic from './atomic'
import * as reserveKey from './reserve-key'
import * as types from '../types'

export * from './atomic'
export type {
  TableSystemDateCondition,
  TableSystemFilter,
  TableSystemNumberCondition,
  TableSystemOrderBy,
} from './system-fields'
export type {
  ReserveTableKeyInput,
  ReserveTableKeyOutput,
  TableRowMetadata,
} from './reserve-key'

type IClient = common.types.Simplify<
  gen.Client & {
    atomicTables: (
      input: atomic.AtomicTablesInput
    ) => Promise<atomic.AtomicTablesOutput>
    reserveTableKey: (
      input: reserveKey.ReserveTableKeyInput
    ) => Promise<reserveKey.ReserveTableKeyOutput>
  }
>
export type Operation = common.types.Operation<IClient>
export type ClientInputs = common.types.Inputs<IClient>
export type ClientOutputs = common.types.Outputs<IClient>

export type ClientProps = common.types.CommonClientProps & {
  token: string
  botId: string
  integrationId?: string
  integrationAlias?: string
}

export class Client extends gen.Client {
  public readonly config: Readonly<types.ClientConfig>
  private readonly _customAxiosInstance: ReturnType<typeof common.axios.createAxiosInstance>

  public constructor(clientProps: ClientProps) {
    const clientConfig = common.config.getClientConfig(clientProps)
    const axiosInstance = common.axios.createAxiosInstance(clientConfig, clientProps.retry)

    super(axiosInstance, {
      toApiError: common.errors.toApiError,
    })

    this.config = clientConfig
    this._customAxiosInstance = axiosInstance
  }

  public readonly reserveTableKey = async <TRow extends Record<string, unknown>>(
    input: reserveKey.ReserveTableKeyInput<TRow>
  ): Promise<reserveKey.ReserveTableKeyOutput<TRow>> => {
    return await reserveKey.reserveTableKey(this._customAxiosInstance, input)
  }

  public readonly atomicTables = async <
    const TOperations extends readonly atomic.AtomicTableOperation[],
  >(
    input: atomic.AtomicTablesInput<TOperations>
  ): Promise<atomic.AtomicTablesOutput<TOperations>> => {
    return await atomic.atomicTables(this._customAxiosInstance, input)
  }
}
