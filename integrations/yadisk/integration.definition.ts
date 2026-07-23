import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

// Файловая интеграция: только actions (вебхуков/каналов нет). Токен живёт в
// configuration (.secret), не в secrets-блоке — обоснование в definitions/configuration.ts.
export default new IntegrationDefinition({
  name: 'yadisk',
  title: 'Яндекс.Диск',
  version: '0.3.0',
  description: 'Хранение документов дел на Яндекс.Диске: папки, длительная потоковая загрузка, публичные ссылки.',
  readme: 'hub.md',
  icon: 'icon.svg',
  // Legacy short actions retain their released admission cap. uploadDocument
  // uses the separate durableOperation=v1 business deadline instead.
  maxExecutionTime: 119,
  maxConcurrency: 4,
  configuration,
  actions,
  network: {
    providerHosts: ['cloud-api.yandex.net', '*.disk.yandex.net', '*.disk.yandex.ru'],
    ingressRelayed: false,
    webhookAuthMode: 'shared_secret',
  },
})
