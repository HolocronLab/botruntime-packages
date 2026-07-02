import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'
import { readFileSync } from 'fs'
import * as path from 'path'
import { BP_TSX_SUFFIX } from './component-files.js'

const CUSTOM_COMPONENT_CLASS = 'CustomComponent'

/**
 * Resolves the absolute `.bp.tsx` source path for each `CustomComponent`
 * exported from a wrapper file.
 *
 * Walks the wrapper's TS AST to:
 *   1. Map every `import <local> from '<...>.bp.tsx'` to its resolved path.
 *   2. Find every `new CustomComponent(<Ident>, ...)` and trace back through
 *      const declarations and re-exports to determine which exported name
 *      corresponds to which `.bp.tsx` import.
 *
 * Exports whose first argument cannot be traced back to a `.bp.tsx` import
 * are simply omitted from the returned map; the caller decides how to
 * surface the gap.
 *
 * Supported binding shapes:
 *   - import Foo from './Foo.bp.tsx'
 *   - import * as Foo from './Foo.bp.tsx' (uses the namespace's default)
 *   - export const X = new CustomComponent(Foo, ...)
 *   - export default new CustomComponent(Foo, ...)
 *   - const X = new CustomComponent(Foo, ...); export { X }
 *   - export { X as Y }
 *
 * Re-exports from another module (`export { X } from './foo'`) are skipped;
 * the canonical file that does `new CustomComponent` will be parsed instead.
 */
export function resolveComponentSources(absolutePath: string): Map<string, string> {
  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true })
  const sourceFile = project.createSourceFile(absolutePath, readFileSync(absolutePath, 'utf-8'), { overwrite: true })

  const importBindings = collectBpTsxImports(sourceFile, absolutePath)
  if (importBindings.size === 0) {
    return new Map()
  }

  const localToSource = resolveLocalBindings(sourceFile, importBindings)
  return resolveExports(sourceFile, localToSource, importBindings)
}

/**
 * Build a map of local binding name -> absolute `.bp.tsx` path for every
 * default or namespace import of a `.bp.tsx` file in the source.
 */
function collectBpTsxImports(sourceFile: SourceFile, absolutePath: string): Map<string, string> {
  const imports = new Map<string, string>()
  const dir = path.dirname(absolutePath)

  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue()
    if (!specifier.endsWith(BP_TSX_SUFFIX)) continue

    const resolved = path.resolve(dir, specifier)
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      imports.set(defaultImport.getText(), resolved)
    }
    const namespaceImport = decl.getNamespaceImport()
    if (namespaceImport) {
      imports.set(namespaceImport.getText(), resolved)
    }
  }

  return imports
}

/**
 * Walk every top-level const/let/var declaration assigned from
 * `new CustomComponent(<Ident>, ...)` and map the declaration's name to
 * the `.bp.tsx` source the identifier resolves to.
 */
function resolveLocalBindings(sourceFile: SourceFile, importBindings: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>()

  for (const stmt of sourceFile.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      const initializer = decl.getInitializer()
      if (!initializer) continue
      const source = sourceFromCustomComponentExpr(initializer, importBindings)
      if (source) {
        result.set(decl.getName(), source)
      }
    }
  }

  return result
}

/**
 * Join the local-binding map with all export declarations to produce the
 * final `exportName -> source` map.
 */
function resolveExports(
  sourceFile: SourceFile,
  localToSource: Map<string, string>,
  importBindings: Map<string, string>
): Map<string, string> {
  const exportMap = new Map<string, string>()

  // `export const X = ...` — the local map already covers X if it was a CustomComponent.
  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.isExported()) continue
    for (const decl of stmt.getDeclarations()) {
      const source = localToSource.get(decl.getName())
      if (source) exportMap.set(decl.getName(), source)
    }
  }

  // `export default ...`
  for (const assignment of sourceFile.getExportAssignments()) {
    if (assignment.isExportEquals()) continue
    const expr = assignment.getExpression()

    // `export default new CustomComponent(Foo, ...)`
    const direct = sourceFromCustomComponentExpr(expr, importBindings)
    if (direct) {
      exportMap.set('default', direct)
      continue
    }
    // `export default Local` where Local was a CustomComponent constant
    if (expr.getKind() === SyntaxKind.Identifier) {
      const fromLocal = localToSource.get(expr.getText())
      if (fromLocal) exportMap.set('default', fromLocal)
    }
  }

  // `export { X }` and `export { X as Y }` (no module specifier — local re-export).
  for (const decl of sourceFile.getExportDeclarations()) {
    if (decl.getModuleSpecifier()) continue
    for (const named of decl.getNamedExports()) {
      const localName = named.getNameNode().getText()
      const aliasNode = named.getAliasNode()
      const exportName = aliasNode ? aliasNode.getText() : localName
      const source = localToSource.get(localName)
      if (source) exportMap.set(exportName, source)
    }
  }

  return exportMap
}

/**
 * If the given expression is `new CustomComponent(<Ident>, ...)` and
 * `<Ident>` resolves to a `.bp.tsx` import, return the absolute source path.
 * Returns undefined for any other shape.
 */
function sourceFromCustomComponentExpr(expr: Node, importBindings: Map<string, string>): string | undefined {
  if (expr.getKind() !== SyntaxKind.NewExpression) return undefined
  const newExpr = expr.asKindOrThrow(SyntaxKind.NewExpression)

  if (newExpr.getExpression().getText() !== CUSTOM_COMPONENT_CLASS) return undefined

  const args = newExpr.getArguments()
  const firstArg = args[0]
  if (!firstArg || firstArg.getKind() !== SyntaxKind.Identifier) return undefined

  return importBindings.get(firstArg.getText())
}
