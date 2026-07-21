import { RuntimeError } from '@holocronlab/botruntime-sdk'

import { POCHTA_ERROR_CODE, PochtaApiError } from './pochta-api'

export const POCHTA_TRACKING_CREDENTIALS_MESSAGE =
  'Неверные реквизиты API Трекинга Почты России. Используйте логин и пароль из вкладки «API Трекинга», а не AccessToken из «API Почта Бизнес».'

export function toPochtaRegistrationError(error: unknown): Error {
  if (error instanceof PochtaApiError && error.code === POCHTA_ERROR_CODE.authorizationFailed) {
    return new RuntimeError(POCHTA_TRACKING_CREDENTIALS_MESSAGE, error)
  }
  return error instanceof Error ? error : new Error('Pochta integration registration failed')
}
