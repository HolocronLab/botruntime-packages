import type { WorkflowDefinitions as WD } from '@holocronlab/botruntime-runtime/_types/workflows'

export type WorkflowDefinitions = WD extends never ? never : WD

export type WorkflowInputs = {
  [K in keyof WorkflowDefinitions]: WorkflowDefinitions[K]['input']
}

export type WorkflowOutputs = {
  [K in keyof WorkflowDefinitions]: WorkflowDefinitions[K]['output']
}

export type WorkflowStates = {
  [K in keyof WorkflowDefinitions]: WorkflowDefinitions[K]['state']
}
