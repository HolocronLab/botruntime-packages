import { z, IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { integrationName } from './package.json'

export default new IntegrationDefinition({
  name: integrationName,
  version: '0.1.0',
  readme: 'hub.md',
  icon: 'icon.svg',
  network: {
    // This action does not call any external service. List provider hosts here
    // if you add outbound calls (e.g. ['api.example.com']) — the server uses
    // this to build the production egress allowlist.
    providerHosts: [],
  },
  actions: {
    helloWorld: {
      title: 'Hello World',
      description: 'A simple hello world action',
      input: {
        schema: z.object({
          name: z.string().optional(),
        }),
      },
      output: {
        schema: z.object({
          message: z.string(),
        }),
      },
    },
  },
})
