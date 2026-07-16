import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

export function registryDependencySpecs(packageJson, scope = '@holocronlab/') {
  const dependencies = packageJson?.dependencies ?? {}
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw new TypeError('package dependencies must be an object')
  }

  return Object.entries(dependencies)
    .filter(([name]) => name.startsWith(scope))
    .map(([name, range]) => {
      if (typeof range !== 'string' || range.length === 0) {
        throw new TypeError(`registry dependency ${name} must have a version range`)
      }
      if (range.startsWith('file:')) {
        throw new Error(`local dependency ${name} must be rewritten before registry readiness is checked`)
      }
      return `${name}@${range}`
    })
    .sort()
}

export async function waitForRegistryDependencies({
  specs,
  isAvailable,
  attempts = 60,
  delayMs = 5_000,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onAttempt = () => {},
}) {
  if (!Array.isArray(specs) || specs.some((spec) => typeof spec !== 'string' || spec.length === 0)) {
    throw new TypeError('registry dependency specs must be non-empty strings')
  }
  if (typeof isAvailable !== 'function') throw new TypeError('isAvailable must be a function')
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('attempts must be a positive integer')
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('delayMs must be non-negative')

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const availability = await Promise.all(specs.map(async (spec) => [spec, await isAvailable(spec)]))
    const missing = availability.filter(([, available]) => !available).map(([spec]) => spec)
    await onAttempt({ attempt, missing })
    if (missing.length === 0) return { attemptsUsed: attempt }
    if (attempt < attempts) await sleep(delayMs)
    else throw new Error(`registry dependencies did not become available: ${missing.join(', ')}`)
  }

  throw new Error('registry readiness loop ended unexpectedly')
}

async function npmSpecAvailable(spec, registry) {
  try {
    await execFileAsync(
      'npm',
      ['view', spec, 'version', '--userconfig=/dev/null', `--registry=${registry}`],
      { timeout: 30_000 }
    )
    return true
  } catch {
    return false
  }
}

async function main() {
  const packagePath = process.argv[2]
  if (!packagePath) throw new Error('usage: registry-release-readiness.mjs <package.json>')

  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const specs = registryDependencySpecs(packageJson)
  const registry = process.env.PUBLIC_NPM_REGISTRY ?? 'https://registry.npmjs.org'
  const attempts = Number(process.env.REGISTRY_READINESS_ATTEMPTS ?? 60)
  const delayMs = Number(process.env.REGISTRY_READINESS_DELAY_MS ?? 5_000)

  const result = await waitForRegistryDependencies({
    specs,
    attempts,
    delayMs,
    isAvailable: (spec) => npmSpecAvailable(spec, registry),
    onAttempt: ({ attempt, missing }) => {
      if (missing.length > 0) {
        process.stdout.write(`registry readiness attempt ${attempt}: waiting for ${missing.join(', ')}\n`)
      }
    },
  })
  process.stdout.write(`registry dependencies are available after ${result.attemptsUsed} attempt(s)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
