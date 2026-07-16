import { RuntimeError } from '@holocronlab/botruntime-sdk'
import { TerritorialJurisdictionClient } from './territorial-jurisdiction-api'

export type TerritorialJurisdictionConfiguration = {
  apiToken?: string
}

export function clientFromConfig(cfg: TerritorialJurisdictionConfiguration): TerritorialJurisdictionClient {
  const token = typeof cfg.apiToken === 'string' ? cfg.apiToken.trim() : ''
  if (!token) {
    throw new RuntimeError('Территориальная подсудность: не задан API-токен (apiToken)')
  }
  return new TerritorialJurisdictionClient({ token })
}
