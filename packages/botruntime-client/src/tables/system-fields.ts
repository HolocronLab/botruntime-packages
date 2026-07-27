export type TableSystemNumberCondition =
  | number
  | {
      $eq?: number
      $ne?: number
      $gt?: number
      $gte?: number
      $lt?: number
      $lte?: number
      $in?: readonly number[]
      $nin?: readonly number[]
    }

export type TableSystemDateCondition =
  | string
  | {
      $eq?: string
      $ne?: string
      $gt?: string
      $gte?: string
      $lt?: string
      $lte?: string
      $in?: readonly string[]
      $nin?: readonly string[]
    }

export interface TableSystemFilter {
  id?: TableSystemNumberCondition
  rowVersion?: TableSystemNumberCondition
  createdAt?: TableSystemDateCondition
  updatedAt?: TableSystemDateCondition
  $and?: readonly TableSystemFilter[]
  $or?: readonly TableSystemFilter[]
  $not?: TableSystemFilter
  /** Declared user columns keep the existing Mongo-like filter contract. */
  [column: string]: unknown
}

export type TableSystemOrderBy =
  | 'id'
  | 'rowVersion'
  | 'createdAt'
  | 'updatedAt'
  /** @deprecated order-only alias for id */
  | 'row_id'
  | string
