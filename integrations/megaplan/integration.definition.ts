import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions, events, states, configSchema } from './definitions'

export default new IntegrationDefinition({
  name: 'megaplan',
  version: '0.2.5',

  title: 'Megaplan',
  readme: 'hub.md',
  icon: 'icon.svg',
  description: 'Megaplan CRM: сделки, задачи-согласования, процессные команды и аудит.',
  network: {
    providerHosts: ['*.megaplan.ru'],
    ingressRelayed: true,
    webhookAuthMode: 'shared_secret',
  },
  configuration: {
    schema: configSchema,
  },
  actions,
  events,
  states,
  __advanced: {
    useLegacyZuiTransformer: true,
  },
  attributes: {
    category: 'CRM & Sales',
  },
})
