# Botruntime SDK

SDK for TypeScript. Made for building bots, plugins and integrations as code on botruntime.

## Installation

```bash
npm install --save @holocronlab/botruntime-sdk # for npm
yarn add @holocronlab/botruntime-sdk # for yarn
pnpm add @holocronlab/botruntime-sdk # for pnpm
```

## Bot execution timeout

Set `maxExecutionTime` on a bot definition to limit one invocation. The value is
an integer number of seconds from `1` to `3600`. If omitted, the platform uses
`120` seconds.

```ts
import { BotDefinition } from '@holocronlab/botruntime-sdk'

export default new BotDefinition({
  maxExecutionTime: 300,
})
```

The setting applies to each message or event dispatch. It does not turn a
single invocation into a durable workflow checkpoint. When a production
invocation exceeds the deadline, the platform recycles its bot process; an
already-started external effect can therefore have an unknown outcome and
should use an idempotency key.
