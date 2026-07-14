import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions, states, configSchema } from './definitions'

export default new IntegrationDefinition({
  name: 'megaplan',
  version: '0.1.0',

  title: 'Megaplan',
  readme: 'hub.md',
  icon: 'icon.svg',
  description: 'Megaplan CRM: контрагенты, сделки, воронка, комментарии, чек-листы и задачи.',
  configuration: {
    schema: configSchema,
  },
  actions,
  states,
  network: {
    providerHosts: ['*.megaplan.ru'],
    ingressRelayed: false,
    webhookAuthMode: 'shared_secret',
  },
  __advanced: {
    useLegacyZuiTransformer: true,
  },
  attributes: {
    category: 'CRM & Sales',
  },
})
