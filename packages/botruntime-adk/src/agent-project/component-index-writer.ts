import { Project } from 'ts-morph'
import { BP_TSX_SUFFIX } from './component-files.js'

const RUNTIME_MODULE = '@holocronlab/botruntime-runtime'
const RUNTIME_NAMED = 'CustomComponent'

export type IndexLlmInput = {
  description: string
  propsSchemaExport: string
  exampleValues: Record<string, unknown>[]
}

export type BuildIndexUpdateArgs = {
  /** Current text of `index.ts`, or `null` when the file doesn't exist yet. */
  existing: string | null
  exportName: string
  llm: IndexLlmInput | null
}

function makeProject(text: string): { project: Project; sourceFile: ReturnType<Project['createSourceFile']> } {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true })
  const sourceFile = project.createSourceFile('_index.ts', text, { overwrite: true })
  return { project, sourceFile }
}

export function findConflictingExport(existing: string | null, exportName: string): string | null {
  if (!existing) return null
  const { sourceFile } = makeProject(existing)
  const target = `${exportName}Component`
  return sourceFile.getExportedDeclarations().has(target) ? target : null
}

/**
 * Apply the registry add-to-bot edits to `index.ts` text and return the new
 * source.
 *
 * Caller is expected to have already screened for conflicts via
 * `findConflictingExport`.
 *
 */
export function buildIndexUpdate(args: BuildIndexUpdateArgs): string {
  const { existing, exportName, llm } = args
  const { sourceFile } = makeProject(existing ?? '')

  ensureRuntimeImport(sourceFile)

  sourceFile.addImportDeclaration({
    defaultImport: exportName,
    moduleSpecifier: `./${exportName}/${exportName}${BP_TSX_SUFFIX}`,
  })

  if (llm) {
    sourceFile.addImportDeclaration({
      namedImports: [llm.propsSchemaExport],
      moduleSpecifier: `./${exportName}/${exportName}.bp.types`,
    })
  }

  let text = sourceFile.getFullText()
  if (text.length > 0 && !text.endsWith('\n')) text += '\n'
  text += '\n' + buildExportLine(exportName, llm) + '\n'
  return text
}

function ensureRuntimeImport(sourceFile: ReturnType<Project['createSourceFile']>): void {
  const existing = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === RUNTIME_MODULE)
  if (!existing) {
    sourceFile.addImportDeclaration({
      namedImports: [RUNTIME_NAMED],
      moduleSpecifier: RUNTIME_MODULE,
    })
    return
  }
  const hasNamed = existing.getNamedImports().some((n) => n.getName() === RUNTIME_NAMED)
  if (!hasNamed) existing.addNamedImport(RUNTIME_NAMED)
}

function buildExportLine(exportName: string, llm: IndexLlmInput | null): string {
  if (!llm) return `export const ${exportName}Component = new CustomComponent(${exportName})`
  const examplesJson = JSON.stringify(llm.exampleValues, null, 2).replace(/\n/g, '\n  ')
  return [
    `export const ${exportName}Component = new CustomComponent(${exportName}, {`,
    `  description: ${JSON.stringify(llm.description)},`,
    `  props: ${llm.propsSchemaExport},`,
    `  exampleValues: ${examplesJson},`,
    `})`,
  ].join('\n')
}
