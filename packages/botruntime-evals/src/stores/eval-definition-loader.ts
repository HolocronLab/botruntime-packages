import type { EvalDefinition } from '../definition'
import { loadEvalsFromDir } from '../loader'

export type EvalDefinitionLoader = () => Promise<EvalDefinition[]>

export function createDiskEvalLoader(evalsDir: string): EvalDefinitionLoader {
  return () => loadEvalsFromDir(evalsDir)
}
