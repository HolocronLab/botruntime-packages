/**
 * Eval file loader.
 * Loads *.eval.ts files from a directory using dynamic imports.
 * Supports both default and named exports, and multiple evals per file.
 */

import { readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { EvalDefinition, EvalFilter } from './types'
import { Eval } from './types'
import { EvalRunnerError } from './errors'

function isEvalDefinition(value: unknown): value is EvalDefinition {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    (value as Record<string, unknown>).name !== '' &&
    Array.isArray((value as Record<string, unknown>).conversation)
  )
}

export async function loadEvalFile(filePath: string): Promise<EvalDefinition[]> {
  const absPath = resolve(filePath)

  let mod: Record<string, unknown>
  try {
    mod = await import(absPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Guidance stays in the message until the CLI renders `suggestion`
    // (cli-package remediation) — report.error/logger.fatal only show message.
    throw new EvalRunnerError({
      code: 'EVAL_LOAD_FAILED',
      message:
        `Failed to load eval file ${filePath}: ${msg}\n\n` +
        'Make sure your eval file:\n' +
        '  - Has no syntax or type errors\n' +
        '  - Exports one or more `new Eval({...})` instances\n' +
        '  - Has all dependencies installed (`bun install`)',
      expected: true,
      cause: err,
    })
  }

  const results: EvalDefinition[] = []

  for (const [key, value] of Object.entries(mod)) {
    if (key === '__esModule') continue
    if (value instanceof Eval || isEvalDefinition(value)) {
      results.push(value)
    }
  }

  if (results.length === 0) {
    throw new EvalRunnerError({
      code: 'EVAL_FILE_EMPTY',
      message: `Invalid eval file ${filePath}: no valid evals found. Export one or more \`new Eval({...})\` instances (as default or named exports).`,
      expected: true,
    })
  }

  return results
}

export async function loadEvalsFromDir(dirPath: string): Promise<EvalDefinition[]> {
  const absDir = resolve(dirPath)
  if (!existsSync(absDir)) {
    return []
  }

  const files = readdirSync(absDir).filter((f) => f.endsWith('.eval.ts'))
  const evals: EvalDefinition[] = []

  for (const f of files) {
    const defs = await loadEvalFile(`${absDir}/${f}`)
    evals.push(...defs)
  }

  const seen = new Set<string>()
  for (const e of evals) {
    if (seen.has(e.name)) {
      throw new EvalRunnerError({
        code: 'EVAL_DUPLICATE_NAME',
        message: `Duplicate eval name "${e.name}" found in ${dirPath} — names must be unique across the evals directory.`,
        expected: true,
        details: { name: e.name },
      })
    }
    seen.add(e.name)
  }

  return evals
}

export async function loadEvalByName(dirPath: string, name: string): Promise<EvalDefinition | null> {
  const absDir = resolve(dirPath)
  if (!existsSync(absDir)) return null

  const files = readdirSync(absDir).filter((f) => f.endsWith('.eval.ts'))

  for (const f of files) {
    const defs = await loadEvalFile(`${absDir}/${f}`)
    const found = defs.find((d) => d.name === name)
    if (found) return found
  }

  return null
}

export function filterEvals(evals: EvalDefinition[], filter?: EvalFilter): EvalDefinition[] {
  if (!filter) return evals

  return evals.filter((e) => {
    if (filter.names && filter.names.length > 0) {
      if (!filter.names.includes(e.name)) return false
    }
    if (filter.tags && filter.tags.length > 0) {
      if (!e.tags || !filter.tags.some((t) => e.tags!.includes(t))) return false
    }
    if (filter.type) {
      if (e.type !== filter.type) return false
    }
    return true
  })
}
