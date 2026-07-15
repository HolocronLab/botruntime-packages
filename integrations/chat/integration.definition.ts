import { IntegrationDefinition, messages, z } from '@holocronlab/botruntime-sdk'

const definition = {
  name: 'chat',
  version: '0.7.6',
  title: 'Chat',
  description: 'HTTP Chat API channel for CLIs, web applications and hosted evaluations.',
  icon: 'icon.svg',
  readme: 'hub.md',
  configuration: {
    schema: z.object({
      encryptionKey: z.string().min(32).secret().title('User key encryption secret'),
    }),
  },
  channels: {
    channel: {
      title: 'Chat',
      description: 'Generic HTTP chat channel',
      messages: messages.defaults,
      conversation: {
        tags: {
          owner: { title: 'Owner user ID' },
          fid: { title: 'Foreign conversation ID' },
        },
      },
      message: { tags: {} },
    },
  },
  user: {
    tags: {
      fid: { title: 'Foreign user ID' },
      profile: { title: 'Profile' },
    },
  },
  actions: {},
  events: {},
  network: {
    providerHosts: [],
    ingressRelayed: false,
    webhookAuthMode: 'handler_verified',
  },
  __advanced: { useLegacyZuiTransformer: true },
  attributes: {
    category: 'Communication & Channels',
    guideSlug: 'chat',
    repo: 'botruntime',
  },
}

// IntegrationDefinition serializes this declaration; cloudapi is the authority
// for the supported webhook authentication modes.
export default new IntegrationDefinition(
  definition as unknown as ConstructorParameters<typeof IntegrationDefinition>[0]
)
