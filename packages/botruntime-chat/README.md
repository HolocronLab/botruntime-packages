# @holocronlab/botruntime-chat

Chat API client consumed by the `brt` CLI to power `brt chat` (an interactive
terminal chat session against a bot's Chat integration webhook).

## Provenance

This package vendors the published npm **dist** of `@botpress/chat@0.5.5`
verbatim (`dist/index.cjs`, `dist/index.mjs`, `dist/index.d.ts`, and the
generated `.d.ts` files under `dist/gen`). It is a fork of Botpress
Technologies, Inc.'s MIT-licensed `@botpress/chat` package — see `LICENSE`.

The upstream package's *source* is codegenerated from an OpenAPI spec via a
`chat-api` codegen chain that is not published to npm. Because `@botpress/chat`
is not the byte-exact oracle crux for this fork (that role belongs to
`@botpress/client`), vendoring its dist is the deliberate Phase-2 choice here.
A source-level fork (owning the codegen chain / OpenAPI spec, analogous to
`@botpress/client`'s ADR-0005 migration) is deferred to that same
openapi -> owned-source migration effort.

No source changes were made to the vendored dist — this package only renames
the npm package identity (`name`, `repository`) so it can be published
independently under the `@holocronlab` scope. The runtime behavior, wire
contract (HTTP paths, headers), and public API surface are unchanged from
`@botpress/chat@0.5.5`.

## Installation

```bash
npm install @holocronlab/botruntime-chat
```

## Usage

```ts
import * as chat from '@holocronlab/botruntime-chat'

const client = await chat.Client.connect({ webhookId: process.env.WEBHOOK_ID! })

const { conversation } = await client.createConversation({})
await client.createMessage({
  conversationId: conversation.id,
  payload: { type: 'text', text: 'hello world' },
})

const listener = await client.listenConversation({ id: conversation.id })
listener.on('message_created', (message: chat.Signals['message_created']) => {
  console.log(message.payload)
})
```

See upstream `@botpress/chat` documentation for the full API (conversations,
messages, participants, users, events, realtime listening via SSE/websocket).

## Dependencies

Runtime dependencies are unchanged from upstream: `axios`, `browser-or-node`,
`event-source-polyfill`, `eventsource`, `jsonwebtoken`, `qs`, `verror`, `zod`.
Zero `@botpress/*` or `@bpinternal/*` runtime dependencies.

## License

MIT (see `LICENSE`). Derived from Botpress Technologies, Inc.'s
`@botpress/chat` package.
