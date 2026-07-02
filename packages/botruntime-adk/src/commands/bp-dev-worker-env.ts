type Env = Record<string, string | undefined>

function isEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

function shouldDisableSourceMaps(env: Env): boolean {
  return isEnabled(env.ADK_DEV_WORKER_DISABLE_SOURCE_MAPS)
}

function compactNodeOptions(options: (string | undefined)[]): string {
  return options
    .map((option) => option?.trim())
    .filter((option): option is string => !!option)
    .join(' ')
}

export function stripEnableSourceMapsOption(nodeOptions: string | undefined): string {
  return (nodeOptions ?? '')
    .replace(/(^|\s)--enable-source-maps(?=\s|$)/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function shouldEnableWorkerSourceMaps(env: Env = process.env): boolean {
  if (shouldDisableSourceMaps(env)) {
    return false
  }

  return isEnabled(env.ADK_DEV_WORKER_SOURCE_MAPS)
}

export function shouldPassSourceMapFlag(sourceMap: boolean, env: Env = process.env): boolean {
  return sourceMap && !shouldDisableSourceMaps(env)
}

export function getWorkerNodeOptions(env: Env = process.env): string {
  // Strip --enable-source-maps from every inherited source (NODE_OPTIONS and the
  // diagnostic extras) so the explicit shouldEnableWorkerSourceMaps() gate is the
  // ONLY thing that can turn it back on. This keeps the default-off policy from
  // being silently bypassed via ADK_DEV_WORKER_NODE_OPTIONS_EXTRA, and prevents a
  // duplicate flag when the opt-in and the extras both request it.
  return compactNodeOptions([
    stripEnableSourceMapsOption(env.NODE_OPTIONS),
    shouldEnableWorkerSourceMaps(env) ? '--enable-source-maps' : undefined,
    stripEnableSourceMapsOption(env.ADK_DEV_WORKER_NODE_OPTIONS_EXTRA),
  ])
}
