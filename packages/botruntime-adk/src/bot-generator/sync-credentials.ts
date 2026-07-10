import { AdkError } from '@holocronlab/botruntime-analytics'
import type { ServerConnectionCredentials } from '../auth/index.js'
import type { ServerConfigTarget } from '../integrations/config-utils.js'

export function resolveSyncCredentials(
  configTarget?: ServerConfigTarget,
  provided?: ServerConnectionCredentials
): ServerConnectionCredentials | undefined {
  const authoritative = configTarget?.credentials
  if (!authoritative) return provided

  if (
    provided &&
    (provided.token !== authoritative.token ||
      provided.apiUrl.replace(/\/+$/, '') !== authoritative.apiUrl.replace(/\/+$/, '') ||
      provided.workspaceId !== authoritative.workspaceId)
  ) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message: 'Dependency sync credentials do not match the explicit config target.',
      expected: true,
    })
  }

  return authoritative
}
