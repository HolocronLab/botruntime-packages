import { IntegrationDefinition } from '@botpress/sdk'
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
  __advanced: {
    useLegacyZuiTransformer: true,
  },
  attributes: {
    category: 'CRM & Sales',
  },
})
