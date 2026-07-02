import { Interface } from '@holocronlab/botruntime-client'

export interface InterfaceRef {
  workspace?: string
  name: string
  version: string
  fullName: string
}

export type InterfaceDefinition = Interface

export interface InterfaceValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ParsedInterface {
  alias: string
  ref: InterfaceRef
  config?: Record<string, unknown>
  definition?: InterfaceDefinition
  validationResult?: InterfaceValidationResult
}
