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

const env = getSingleton('__ADK_GLOBAL_ENV', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- initialized lazily
  let env: Development | Production | Command = {} as any

  // Check if running in Bun - if so, always treat as command mode
  const isBun = typeof process.versions.bun !== 'undefined'

  if (typeof process.env.AWS_LAMBDA_FUNCTION_NAME === 'string' && process.env.AWS_LAMBDA_FUNCTION_NAME.length > 0) {
    env = {
      type: 'production',
    }
  }
  //////////
  // Development mode only possible in Node.js (not Bun)
  else if (!isBun && process.env.NODE_ENV === 'development') {
    env = {
      type: 'development',
      adk: {
        directory: process.env.ADK_DIRECTORY || '',
      },
      agent: {
        directory: process.env.AGENT_DIRECTORY || '',
      },
      local: {
        PAT: process.env.ADK_LOCAL_PAT || '',
      },
    }
  }
  /////////
  else {
    // Bun is always command mode, or Node.js when not in development
    env = {
      type: 'command',
      command: 'adk-dev', // default
    }
  }

  return env
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
 * Set the ADK command being executed
 * @internal - Only called by ADK internal code during primitive scanning
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
