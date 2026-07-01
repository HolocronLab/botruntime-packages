// Шов конфига интеграции → клиент Диска. Токен приходит per-install в
// ctx.configuration (зашифрованным, доставляется рантаймом через заголовок
// x-bp-configuration), а НЕ из build-time secrets: общего вендорского OAuth-
// приложения у Я.Диска нет, токен у каждой фирмы свой. Нет токена → fail-loud
// (деплой/конфиг-ошибку видно сразу, не маскируем тихим no-op — CLAUDE.md).
import { RuntimeError } from '@holocronlab/botruntime-sdk'
import { YadiskClient } from './yadisk-api'

export type YadiskConfiguration = {
  yadiskToken?: string
  yadiskFolder?: string
}

export function clientFromConfig(cfg: YadiskConfiguration): YadiskClient {
  if (!cfg.yadiskToken) {
    throw new RuntimeError('Яндекс.Диск: не задан OAuth-токен (yadiskToken)')
  }
  return new YadiskClient({ token: cfg.yadiskToken })
}
