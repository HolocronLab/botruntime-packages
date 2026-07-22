import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

export default new IntegrationDefinition({
  name: 'cloudconvert',
  version: '0.1.0',
  title: 'CloudConvert',
  description: 'Высокоточная конвертация DOCX в PDF через официальный CloudConvert API v2.',
  readme: 'hub.md',
  icon: 'icon.svg',
  configuration,
  actions,
  network: {
    providerHosts: [
      'api.cloudconvert.com',
      'sync.api.cloudconvert.com',
      'upload.cloudconvert.com',
      'storage.cloudconvert.com',
    ],
    ingressRelayed: false,
  },
  attributes: { category: 'Productivity' },
})
