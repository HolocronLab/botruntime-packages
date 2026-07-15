import { getSingleton } from './runtime/singletons'
import type { PackageVersions } from './globals'

export type Development = {
  type: 'development'
  adk: {
    directory: string
  }
  agent: {
    directory: string
  }
  local: {
    /** The Personal Access Token of the user currently in dev mode */
    PAT: string
  }
}

export type Production = {
  type: 'production'
}

export type Command = {
  type: 'command'
  command: 'adk-dev' | 'adk-build' | 'adk-deploy'
}

type EnvironmentVariables = Record<string, string | undefined>

export function resolveEnvironment(environment: EnvironmentVariables, isBun: boolean): Development | Production | Command {
  if (typeof environment.AWS_LAMBDA_FUNCTION_NAME === 'string' && environment.AWS_LAMBDA_FUNCTION_NAME.length > 0) {
    return { type: 'production' }
  }

  // BRT launches its classic tunnel runtime with Bun as well. Keep runtime
  // classification separate from WORKER_MODE, which controls the ADK worker pool.
  const isDevelopmentWorker =
    environment.NODE_ENV === 'development' && environment.ADK_RUNTIME_MODE === 'development'
  if ((!isBun || isDevelopmentWorker) && environment.NODE_ENV === 'development') {
    return {
      type: 'development',
      adk: {
        directory: environment.ADK_DIRECTORY || '',
      },
      agent: {
        directory: environment.AGENT_DIRECTORY || '',
      },
      local: {
        PAT: environment.ADK_LOCAL_PAT || '',
      },
    }
  }

  return {
    type: 'command',
    command: 'adk-dev',
  }
}

const env = getSingleton('__ADK_GLOBAL_ENV', () => {
  const isBun = typeof process.versions.bun !== 'undefined'
  return resolveEnvironment(process.env, isBun)
})

/**
 * Global request counter for environment metrics
 */
let globalRequestCount = 0

/**
 * CPU count cached at startup
 */
let cachedCpuCount: number | null = null

/**
 * Initialize CPU count cache at startup
 */
function initCpuCount(): void {
  if (cachedCpuCount !== null) {
    return
  }

  try {
    cachedCpuCount = require('os').cpus().length
  } catch {
    cachedCpuCount = 1
  }
}

// Initialize CPU count at module load time
initCpuCount()

/**
 * Increment the global request counter
 */
export function incrementRequestCount(): number {
  return ++globalRequestCount
}

/**
 * Get current request count
 */
export function getRequestCount(): number {
  return globalRequestCount
}

export const Environment = Object.assign(env, {
  isDevelopment(): this is Development {
    return env.type === 'development'
  },

  isProduction(): this is Production {
    return env.type === 'production'
  },

  isCommand(): this is Command {
    return env.type === 'command'
  },
})

/**
 * Set the generator compatibility command being executed.
 * @internal - Only called by generated primitive-scanning code.
 */
export function setAdkCommand(command: 'adk-dev' | 'adk-build' | 'adk-deploy'): void {
  Object.assign(env, { type: 'command', command })
}

function getPackageVersion(key: keyof PackageVersions): string {
  try {
    return (typeof __PACKAGE_VERSIONS__ !== 'undefined' && __PACKAGE_VERSIONS__?.[key]) || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Get environment information for telemetry
 * Each property is individually fail-safe to prevent collection errors
 */
export function getEnvironmentInfo() {
  // Environment type (required)
  const environment: 'development' | 'production' = (() => {
    try {
      return Environment.isDevelopment() ? 'development' : 'production'
    } catch {
      return 'production'
    }
  })()

  // Uptime (required)
  const uptime: number = (() => {
    try {
      return process.uptime()
    } catch {
      return 0
    }
  })()

  // OS platform - only include if it's one of the supported values
  const osPlatform: 'darwin' | 'linux' | 'win32' | undefined = (() => {
    const platform = process.platform
    if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
      return platform
    }
    return undefined
  })()

  return {
    environment,
    'os.platform': osPlatform,
    'os.arch': process.arch,
    'node.version': process.version,
    'adk.version': getPackageVersion('adk'),
    'runtime.version': getPackageVersion('runtime'),
    'sdk.version': getPackageVersion('sdk'),
    'llmz.version': getPackageVersion('llmz'),
    'zai.version': getPackageVersion('zai'),
    'cognitive.version': getPackageVersion('cognitive'),
    uptime,
  }
}

/**
 * Get request-level metrics (memory, CPU, request count)
 */
export function getRequestMetrics() {
  // Memory RSS
  const memoryRss: number | undefined = (() => {
    try {
      return process.memoryUsage().rss
    } catch {
      return undefined
    }
  })()

  // Memory heap total
  const memoryHeapTotal: number | undefined = (() => {
    try {
      return process.memoryUsage().heapTotal
    } catch {
      return undefined
    }
  })()

  return {
    'memory.rss': memoryRss,
    'memory.heapTotal': memoryHeapTotal,
    'cpu.count': cachedCpuCount ?? 1,
    'requests.total': globalRequestCount,
  }
}
