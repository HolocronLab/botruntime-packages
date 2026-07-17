import { IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { integrationName } from './package.json'

export default new IntegrationDefinition({
  name: integrationName,
  version: '0.1.0',
  readme: 'hub.md',
  icon: 'icon.svg',
  network: {
    // List every external host this integration calls (e.g. ['api.example.com']).
    // The server uses this to build the production egress allowlist.
    providerHosts: [],
  },
})
