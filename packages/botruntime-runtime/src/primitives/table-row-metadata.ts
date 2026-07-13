export type TableRowMetadata = {
  id: number
  rowVersion: number
  createdAt: string
  updatedAt: string
}

export type TableRowUpdateMetadata = {
  id: number
  rowVersion?: number
}
