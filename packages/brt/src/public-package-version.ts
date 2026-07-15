const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export const publicRegistryUrl = (environment: NodeJS.ProcessEnv = process.env): string => {
  return environment.npm_config_registry || environment.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY
}

export async function fetchLatestPublicVersion(
  packageName: string,
  registryUrl = DEFAULT_REGISTRY,
  timeoutMs = 2_000
): Promise<string> {
  const registry = new URL(registryUrl)
  if (registry.protocol !== 'https:' && registry.protocol !== 'http:') {
    throw new Error(`Unsupported npm registry protocol: ${registry.protocol}`)
  }

  const packagePath = encodeURIComponent(packageName.toLowerCase()).replace(/^%40/i, '@')
  const url = new URL(packagePath, `${registry.toString().replace(/\/+$/, '')}/`).toString()
  const controller = new AbortController()
  const timeoutError = new Error(`Public npm registry request timed out after ${timeoutMs}ms`)
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs)
  timer.unref?.()

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Public npm registry returned HTTP ${response.status}`)
    }
    const metadata = (await response.json()) as { 'dist-tags'?: { latest?: unknown } }
    const latest = metadata['dist-tags']?.latest
    if (typeof latest !== 'string' || latest.length === 0) {
      throw new Error('Public npm registry response has no latest version')
    }
    return latest
  } finally {
    clearTimeout(timer)
  }
}
