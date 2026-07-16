import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'
import { events } from './definitions/events'

export default new IntegrationDefinition({
  name: 'yookassa',
  version: '0.2.0',
  title: 'ЮKassa',
  description: 'Создание платежей и подтверждение payment.succeeded с повторной проверкой через API.',
  readme: 'hub.md',
  icon: 'icon.svg',
  configuration,
  actions,
  events,
  network: {
    providerHosts: ['api.yookassa.ru'],
    ingressRelayed: true,
    webhookAuthMode: 'provider_verified',
  },
  attributes: { category: 'Commerce' },
})
