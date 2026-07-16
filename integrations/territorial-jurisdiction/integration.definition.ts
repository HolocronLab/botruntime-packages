import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { actions } from './definitions/actions'
import { configuration } from './definitions/configuration'

export default new IntegrationDefinition({
  name: 'territorial-jurisdiction',
  title: 'Подсудность.РФ',
  version: '0.1.1',
  description:
    'Определение территориальной подсудности районным и городским судам и мировым судьям России по адресу или координатам.',
  readme: 'hub.md',
  icon: 'icon.svg',
  configuration,
  actions,
  network: {
    providerHosts: ['api.xn----7sbarabva2auedgdkhac2adbeqt1tna3e.xn--p1ai'],
    ingressRelayed: false,
  },
  attributes: {
    category: 'Legal',
  },
})
