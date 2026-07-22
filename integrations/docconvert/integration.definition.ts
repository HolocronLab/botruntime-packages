import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

export default new IntegrationDefinition({
  name: 'docconvert',
  version: '0.1.0',
  title: 'Конвертация документов',
  description: 'Высокоточная конвертация DOCX в PDF через изолированный LibreOffice/Gotenberg.',
  readme: 'hub.md',
  icon: 'icon.svg',
  configuration,
  actions,
  // providerHosts перечисляет только хосты, которые runtime направляет через
  // egress proxy. Installation-specific serviceUrl достигается напрямую и не
  // имеет статического provider host.
  network: { providerHosts: [], ingressRelayed: false },
  attributes: { category: 'Productivity' },
})
