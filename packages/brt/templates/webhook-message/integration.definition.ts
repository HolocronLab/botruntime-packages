import { z, IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import { integrationName } from './package.json'

export default new IntegrationDefinition({
  name: integrationName,
  version: '0.1.0',
  readme: 'hub.md',
  icon: 'icon.svg',
  network: {
    // The outbound host is the per-install `webhookUrl` config value, not a
    // fixed provider host known at scaffold time. providerHosts lists the hosts
    // that must be ROUTED THROUGH the platform egress gateway (geo-blocked
    // providers); undeclared hosts are reached directly, so a dynamic webhook
    // URL keeps working with an empty list. If your provider requires the
    // gateway (or once the platform enforces a strict allowlist), list its
    // host(s) here explicitly (e.g. ['api.example.com']).
    providerHosts: [],
  },
  configuration: {
    schema: z.object({
      webhookUrl: z.string().describe('The url to post the bot answers to.'),
    }),
  },
  channels: {
    webhook: {
      conversation: {
        tags: {
          id: { title: 'Conversation ID', description: 'The ID of the conversation' },
        },
      },
      messages: {
        // this channel only supports text messages
        text: {
          schema: z.object({
            text: z.string(),
          }),
        },
      },
    },
  },
  user: {
    tags: {
      id: { title: 'User ID', description: 'The ID of the user' },
    },
  },
})
