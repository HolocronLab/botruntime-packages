# botruntime Cognitive Client

A utility client built on top of `@holocronlab/botruntime-client` to call LLMs for TypeScript. Works in the browser and NodeJS.

## Installation

```bash
npm install --save @holocronlab/botruntime-client @holocronlab/botruntime-cognitive # for npm
yarn add @holocronlab/botruntime-client @holocronlab/botruntime-cognitive # for yarn
pnpm add @holocronlab/botruntime-client @holocronlab/botruntime-cognitive # for pnpm
```

## Basic Usage

```ts
import { Client } from '@holocronlab/botruntime-client'
import { Cognitive } from '@holocronlab/botruntime-cognitive'

const token = 'your-token'
const botId = 'your-bot-id'

const client = new Client({ token, botId })

const cognitive = new Cognitive({ client })

const response = await cognitive.generateContent({ messages: [{ role: 'user', content: 'Hello!' }] })
```

## Managed Cognitive contract

`Cognitive.generateContent` always calls the managed `/v2/cognitive/generate-text`
transport. Model aliases and ordered fallback are resolved server-side. The client
does not call integration `generateContent` actions and never replaces a v2 error
with an unrelated fallback error.

Use `best`, `fast`, `auto`, a `provider:model` id, or an ordered array of model ids.

### Aborting the request

```ts
const cognitive = new Cognitive({ client: new Client() })
const controller = new AbortController()

await cognitive.generateContent({
  messages: [],
  signal: controller.signal,
})
```

## Extensions

We provide two extension points (hooks) for cognitive that allows you to change the input or output of requests.
Hooks can be asynchronous and run sequentially when calling `next(err, value)`.
You can also shortcircuit the execution by calling `done(err, value)`.

```ts
const cognitive = new Cognitive({ client: new Client() })

cognitive.interceptors.request.use(async (err, req, next, done) => {
  // do whatever here
  next(null, req)
})
```
