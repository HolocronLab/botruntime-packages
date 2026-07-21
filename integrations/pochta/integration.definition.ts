import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

export default new IntegrationDefinition({
  name: 'pochta',
  version: '0.1.1',
  title: 'Почта России',
  description: 'Отслеживание отправлений, вручения и возврата через официальный SOAP API Почты России.',
  readme: 'hub.md',
  icon: 'icon.svg',
  configuration,
  actions,
  network: { providerHosts: ['tracking.russianpost.ru'], ingressRelayed: false },
  attributes: { category: 'Commerce' },
})
