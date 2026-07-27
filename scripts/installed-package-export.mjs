import { readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

function isPathInside(parentPath, childPath) {
  const relativePath = relative(parentPath, childPath)
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
}

export function resolveInstalledImportExport(consumerRequire, packageName, subpath) {
  const manifestPath = consumerRequire.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== packageName) {
    throw new Error(`resolved ${packageName} manifest declares unexpected name ${String(manifest.name)}`)
  }

  const declaration = manifest.exports?.[subpath]
  const importPath =
    typeof declaration === 'string'
      ? declaration
      : declaration && typeof declaration === 'object' && !Array.isArray(declaration)
        ? declaration.import
        : undefined
  if (typeof importPath !== 'string' || !importPath.startsWith('./')) {
    throw new Error(`${packageName} export ${subpath} does not declare a relative import target`)
  }

  const packageRoot = dirname(manifestPath)
  const targetPath = resolve(packageRoot, importPath)
  if (!isPathInside(packageRoot, targetPath)) {
    throw new Error(`${packageName} export ${subpath} escapes its package directory`)
  }

  const realPackageRoot = realpathSync(packageRoot)
  const realTargetPath = realpathSync(targetPath)
  if (!isPathInside(realPackageRoot, realTargetPath)) {
    throw new Error(`${packageName} export ${subpath} resolves outside its package directory`)
  }
  return realTargetPath
}
