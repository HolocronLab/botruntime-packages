import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import semver from 'semver'
import * as errors from './errors'

const PLATFORM_PACKAGE_PREFIX = '@holocronlab/botruntime-'
export const TOOLCHAIN_CONTRACT_REL_PATH = path.join('.brt', 'toolchain-contract.json')

export type PlatformToolchainPackage = {
  name: string
  version: string
  realpath: string
}

export type PlatformToolchainIssue = {
  code:
    | 'PACKAGE_NOT_RESOLVED'
    | 'INVALID_PACKAGE_METADATA'
    | 'DECLARED_VERSION_MISMATCH'
    | 'LOCK_VERSION_MISMATCH'
    | 'MULTIPLE_RESOLVED_VERSIONS'
    | 'CAPABILITY_CONFLICT'
  parent: string
  package: string
  declared?: string
  locked?: string
  resolved?: string
  realpath?: string
}

export type PlatformToolchainContract = {
  schemaVersion: 1
  lockfile?: { name: string; sha256: string }
  capabilities: Record<string, number>
  packages: PlatformToolchainPackage[]
  issues: PlatformToolchainIssue[]
}

type PackageJson = {
  name?: unknown
  version?: unknown
  dependencies?: unknown
  botruntime?: unknown
}

type LockPackages = Record<string, unknown>

type GraphNode = {
  name: string
  packageDir: string
  packageJson: PackageJson
  lockKey?: string
  lockPackages?: LockPackages
}

export function inspectPlatformToolchain(
  projectDir: string,
  options: { includeCliPackages?: boolean } = {}
): PlatformToolchainContract {
  const packagesByIdentity = new Map<string, PlatformToolchainPackage>()
  const issues: PlatformToolchainIssue[] = []
  const projectLock = readBunLock(projectDir)
  const queue: GraphNode[] = []
  const visitedEdges = new Set<string>()
  const capabilityValues = new Map<string, Set<number>>()

  enqueueRoot(projectDir, projectLock?.packages, queue, packagesByIdentity, capabilityValues, issues)
  if (options.includeCliPackages !== false) {
    enqueueRoot(cliPackageDirectory(), undefined, queue, packagesByIdentity, capabilityValues, issues)
  }

  while (queue.length > 0) {
    const parent = queue.shift()!
    const dependencies = platformDependencies(parent.packageJson)
    for (const [packageName, declared] of Object.entries(dependencies)) {
      const edgeKey = `${parent.packageDir}\0${packageName}`
      if (visitedEdges.has(edgeKey)) continue
      visitedEdges.add(edgeKey)

      const lockResolution = resolveLockVersion(parent.lockPackages, parent.lockKey, packageName)
      const resolved = resolveInstalledPackage(packageName, parent.packageDir)
      if (!resolved) {
        issues.push({
          code: 'PACKAGE_NOT_RESOLVED',
          parent: parent.name,
          package: packageName,
          declared,
          ...(lockResolution?.version ? { locked: lockResolution.version } : {}),
        })
        continue
      }

      const packageJson = readPackageJson(resolved.packageDir)
      if (
        packageJson?.name !== packageName ||
        typeof packageJson.version !== 'string' ||
        !semver.valid(packageJson.version)
      ) {
        issues.push({
          code: 'INVALID_PACKAGE_METADATA',
          parent: parent.name,
          package: packageName,
          declared,
          ...(lockResolution?.version ? { locked: lockResolution.version } : {}),
          realpath: resolved.realpath,
        })
        continue
      }

      const resolvedVersion = packageJson.version
      const packageRecord = {
        name: packageName,
        version: resolvedVersion,
        realpath: resolved.realpath,
      }
      packagesByIdentity.set(`${packageName}\0${resolvedVersion}\0${resolved.realpath}`, packageRecord)
      collectCapabilities(packageJson, capabilityValues)

      const declaredRange = semver.validRange(declared)
      if (declaredRange && !semver.satisfies(resolvedVersion, declaredRange)) {
        issues.push({
          code: 'DECLARED_VERSION_MISMATCH',
          parent: parent.name,
          package: packageName,
          declared,
          ...(lockResolution?.version ? { locked: lockResolution.version } : {}),
          resolved: resolvedVersion,
          realpath: resolved.realpath,
        })
      }
      if (lockResolution?.version && lockResolution.version !== resolvedVersion) {
        issues.push({
          code: 'LOCK_VERSION_MISMATCH',
          parent: parent.name,
          package: packageName,
          declared,
          locked: lockResolution.version,
          resolved: resolvedVersion,
          realpath: resolved.realpath,
        })
      }

      queue.push({
        name: packageName,
        packageDir: resolved.packageDir,
        packageJson,
        ...(lockResolution?.key ? { lockKey: lockResolution.key } : {}),
        ...(parent.lockPackages ? { lockPackages: parent.lockPackages } : {}),
      })
    }
  }

  const packages = [...packagesByIdentity.values()].sort(comparePackages)
  for (const [packageName, records] of Object.entries(Object.groupBy(packages, (record) => record.name))) {
    const versions = [...new Set((records ?? []).map((record) => record.version))].sort()
    if (versions.length > 1) {
      issues.push({
        code: 'MULTIPLE_RESOLVED_VERSIONS',
        parent: 'toolchain',
        package: packageName,
        resolved: versions.join(', '),
      })
    }
  }
  const capabilities: Record<string, number> = {}
  for (const [name, values] of [...capabilityValues.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...values].sort((a, b) => a - b)
    if (sorted.length === 1) {
      capabilities[name] = sorted[0]!
    } else if (sorted.length > 1) {
      issues.push({
        code: 'CAPABILITY_CONFLICT',
        parent: 'toolchain',
        package: name,
        resolved: sorted.join(', '),
      })
    }
  }

  return {
    schemaVersion: 1,
    ...(projectLock
      ? {
          lockfile: {
            name: path.basename(projectLock.path),
            sha256: sha256(projectLock.bytes),
          },
        }
      : {}),
    capabilities,
    packages,
    issues: issues.sort(compareIssues),
  }
}

export function assertPlatformToolchainCompatible(contract: PlatformToolchainContract): void {
  if (contract.issues.length === 0) return
  const details = contract.issues.map((issue) => {
    const versions = [
      issue.declared ? `declared ${issue.declared}` : undefined,
      issue.locked ? `locked ${issue.locked}` : undefined,
      issue.resolved ? `resolved ${issue.resolved}` : undefined,
    ]
      .filter(Boolean)
      .join(', ')
    return `  - ${issue.code}: ${issue.parent} -> ${issue.package}${versions ? ` (${versions})` : ''}${
      issue.realpath ? ` at ${issue.realpath}` : ''
    }`
  })
  throw new errors.BotpressCLIError(
    `TOOLCHAIN_INCOMPATIBLE: installed botruntime packages do not match their declared/locked contract:\n${details.join(
      '\n'
    )}\nRun bun install with a clean platform dependency graph, then retry.`
  )
}

export function writePlatformToolchainContract(
  projectDir: string,
  contract: PlatformToolchainContract,
  options: { bundleSha256?: string } = {}
): string {
  const artifactPath = path.join(projectDir, TOOLCHAIN_CONTRACT_REL_PATH)
  const tmpPath = `${artifactPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
  try {
    fs.writeFileSync(
      tmpPath,
      `${JSON.stringify({ ...contract, ...(options.bundleSha256 ? { bundleSha256: options.bundleSha256 } : {}) }, null, 2)}\n`,
      'utf8'
    )
    fs.renameSync(tmpPath, artifactPath)
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `Could not write toolchain contract at ${artifactPath}`)
  } finally {
    fs.rmSync(tmpPath, { force: true })
  }
  return artifactPath
}

export function validatePlatformToolchainArtifact(
  projectDir: string,
  current: PlatformToolchainContract,
  bundleSha256: string
): void {
  const artifactPath = path.join(projectDir, TOOLCHAIN_CONTRACT_REL_PATH)
  let artifact: unknown
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  } catch {
    throw invalidToolchainArtifact(artifactPath, 'is missing or invalid JSON')
  }
  if (!isRecord(artifact) || artifact.bundleSha256 !== bundleSha256) {
    throw invalidToolchainArtifact(artifactPath, 'does not match the bundle SHA-256')
  }
  const { bundleSha256: _storedBundleSha256, ...storedContract } = artifact
  if (JSON.stringify(storedContract) !== JSON.stringify(current)) {
    throw invalidToolchainArtifact(artifactPath, 'does not match the current lockfile/toolchain graph')
  }
}

function enqueueRoot(
  packageDir: string,
  lockPackages: LockPackages | undefined,
  queue: GraphNode[],
  packagesByIdentity: Map<string, PlatformToolchainPackage>,
  capabilityValues: Map<string, Set<number>>,
  issues: PlatformToolchainIssue[]
): void {
  const packageJson = readPackageJson(packageDir)
  if (!packageJson) return
  const rootName = typeof packageJson.name === 'string' ? packageJson.name : path.basename(packageDir)
  if (rootName.startsWith(PLATFORM_PACKAGE_PREFIX)) {
    if (typeof packageJson.version !== 'string' || !semver.valid(packageJson.version)) {
      issues.push({
        code: 'INVALID_PACKAGE_METADATA',
        parent: 'toolchain',
        package: rootName,
        realpath: realpath(packageDir),
      })
    } else {
      const record = {
        name: rootName,
        version: packageJson.version,
        realpath: realpath(packageDir),
      }
      packagesByIdentity.set(`${record.name}\0${record.version}\0${record.realpath}`, record)
      collectCapabilities(packageJson, capabilityValues)
    }
  }
  queue.push({
    name: rootName,
    packageDir,
    packageJson,
    ...(lockPackages ? { lockPackages } : {}),
  })
}

function collectCapabilities(packageJson: PackageJson, values: Map<string, Set<number>>): void {
  if (!isRecord(packageJson.botruntime) || !isRecord(packageJson.botruntime.capabilities)) return
  for (const [name, version] of Object.entries(packageJson.botruntime.capabilities)) {
    if (!Number.isSafeInteger(version) || (version as number) < 1) continue
    const versions = values.get(name) ?? new Set<number>()
    versions.add(version as number)
    values.set(name, versions)
  }
}

function platformDependencies(packageJson: PackageJson): Record<string, string> {
  if (!isRecord(packageJson.dependencies)) return {}
  return Object.fromEntries(
    Object.entries(packageJson.dependencies).filter(
      (entry): entry is [string, string] => entry[0].startsWith(PLATFORM_PACKAGE_PREFIX) && typeof entry[1] === 'string'
    )
  )
}

function resolveInstalledPackage(
  packageName: string,
  fromDirectory: string
): { packageDir: string; realpath: string } | undefined {
  let entry: string
  try {
    const bun = (
      globalThis as unknown as {
        Bun?: { resolveSync(id: string, parent: string): string }
      }
    ).Bun
    if (!bun) return resolveInstalledPackageByAncestors(packageName, fromDirectory)
    entry = bun.resolveSync(packageName, fromDirectory)
  } catch {
    return resolveInstalledPackageByAncestors(packageName, fromDirectory)
  }
  const packageDir = findOwningPackageDirectory(entry, packageName)
  return packageDir ? { packageDir, realpath: realpath(packageDir) } : undefined
}

function resolveInstalledPackageByAncestors(
  packageName: string,
  fromDirectory: string
): { packageDir: string; realpath: string } | undefined {
  let cursor = path.resolve(fromDirectory)
  while (true) {
    const candidate = path.join(cursor, 'node_modules', ...packageName.split('/'))
    if (readPackageJson(candidate)?.name === packageName) {
      return { packageDir: candidate, realpath: realpath(candidate) }
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) return undefined
    cursor = parent
  }
}

function findOwningPackageDirectory(entryPath: string, expectedName: string): string | undefined {
  let cursor = fs.statSync(entryPath).isDirectory() ? entryPath : path.dirname(entryPath)
  while (true) {
    if (readPackageJson(cursor)?.name === expectedName) return cursor
    const parent = path.dirname(cursor)
    if (parent === cursor) return undefined
    cursor = parent
  }
}

function readPackageJson(packageDir: string): PackageJson | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function readBunLock(projectDir: string): { path: string; bytes: string; packages: LockPackages } | undefined {
  const lockPath = path.join(projectDir, 'bun.lock')
  if (!fs.existsSync(lockPath)) return undefined
  try {
    const bytes = fs.readFileSync(lockPath, 'utf8')
    const parsed: unknown = JSON.parse(bytes.replace(/,\s*([}\]])/g, '$1'))
    if (!isRecord(parsed) || !isRecord(parsed.packages)) return undefined
    return { path: lockPath, bytes, packages: parsed.packages }
  } catch {
    return undefined
  }
}

function resolveLockVersion(
  packages: LockPackages | undefined,
  parentKey: string | undefined,
  packageName: string
): { key: string; version?: string } | undefined {
  if (!packages) return undefined
  const keys = [...(parentKey ? [`${parentKey}/${packageName}`] : []), packageName]
  for (const key of keys) {
    const raw = packages[key]
    if (!Array.isArray(raw) || typeof raw[0] !== 'string') continue
    const prefix = `${packageName}@`
    if (!raw[0].startsWith(prefix)) return { key }
    const candidate = raw[0].slice(prefix.length)
    return { key, ...(semver.valid(candidate) ? { version: candidate } : {}) }
  }
  return undefined
}

function cliPackageDirectory(): string {
  const moduleDirectory =
    (import.meta as unknown as { dir?: string }).dir ?? path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDirectory, '..')
}

function realpath(value: string): string {
  try {
    return fs.realpathSync(value)
  } catch {
    return path.resolve(value)
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function comparePackages(a: PlatformToolchainPackage, b: PlatformToolchainPackage): number {
  return `${a.name}\0${a.version}\0${a.realpath}`.localeCompare(`${b.name}\0${b.version}\0${b.realpath}`)
}

function compareIssues(a: PlatformToolchainIssue, b: PlatformToolchainIssue): number {
  return `${a.code}\0${a.parent}\0${a.package}\0${a.resolved ?? ''}`.localeCompare(
    `${b.code}\0${b.parent}\0${b.package}\0${b.resolved ?? ''}`
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidToolchainArtifact(artifactPath: string, reason: string): errors.BotpressCLIError {
  return new errors.BotpressCLIError(
    `Toolchain contract at ${artifactPath} ${reason}. Rebuild without --noBuild, then retry.`
  )
}
