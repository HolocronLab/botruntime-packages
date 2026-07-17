export type RuntimeCapabilities = {
  evalManifest: number
  tableFixtures: number
  devTargetRouting: number
  traceProtocol: number
}

export type RuntimeContractReadiness =
  { authority: 'authoritative'; capabilities: RuntimeCapabilities } | { authority: 'unknown'; reason: string }

export class RuntimeContractError extends Error {}

export function parseServerRuntimeContract(value: unknown): RuntimeContractReadiness {
  if (value === undefined) {
    return {
      authority: 'unknown',
      reason: 'server did not report bot.devReadiness.runtimeContract (legacy readiness contract)',
    }
  }
  if (!isRecord(value)) throw new RuntimeContractError('bot.devReadiness.runtimeContract must be an object')
  if (value.schemaVersion !== 1) {
    throw new RuntimeContractError('bot.devReadiness.runtimeContract.schemaVersion must equal 1')
  }
  if (value.authority !== 'cloudapi' || value.source !== 'bot-platform') {
    throw new RuntimeContractError(
      'bot.devReadiness.runtimeContract must have authority=cloudapi and source=bot-platform'
    )
  }
  if (!isRecord(value.capabilities)) {
    throw new RuntimeContractError('bot.devReadiness.runtimeContract.capabilities must be an object')
  }
  const capabilityNames = ['evalManifest', 'tableFixtures', 'devTargetRouting', 'traceProtocol'] as const
  const capabilities = {} as RuntimeCapabilities
  for (const name of capabilityNames) {
    const version = value.capabilities[name]
    if (!Number.isSafeInteger(version) || (version as number) < 1) {
      throw new RuntimeContractError(`bot.devReadiness.runtimeContract.capabilities.${name} must be a positive integer`)
    }
    capabilities[name] = version as number
  }
  return { authority: 'authoritative', capabilities }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
