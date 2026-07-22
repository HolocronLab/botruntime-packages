import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

// Файловая интеграция: только actions (вебхуков/каналов нет). Токен живёт в
// configuration (.secret), не в secrets-блоке — обоснование в definitions/configuration.ts.
export default new IntegrationDefinition({
  name: 'yadisk',
  title: 'Яндекс.Диск',
  version: '0.2.3',
  description: 'Хранение документов дел на Яндекс.Диске: папки, загрузка, публичные ссылки.',
  readme: 'hub.md',
  icon: 'icon.svg',
  // Файловая загрузка может занимать дольше общего 45-секундного лимита.
  // 119 секунд оставляют платформе одну секунду до внешнего 120s host-call deadline.
  maxExecutionTime: 119,
  configuration,
  actions,
  network: {
    providerHosts: ['cloud-api.yandex.net', '*.disk.yandex.net', '*.disk.yandex.ru'],
    ingressRelayed: false,
    webhookAuthMode: 'shared_secret',
  },
})
