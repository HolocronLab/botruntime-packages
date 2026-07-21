# botruntime Runtime

Lightweight runtime library for botruntime agents built with `brt`.

`@holocronlab/botruntime-runtime` provides the pieces a generated agent
project needs at run time and at definition time: the conversation, workflow,
table and knowledge-base primitives used to describe an agent
(`@holocronlab/botruntime-runtime` / `./definition`), the autonomous /
LLM-driven execution engine and chat pipeline (`./runtime`), internal helpers
consumed by the `brt` CLI and tooling (`./internal`), and a small,
dependency-light surface for UI consumers such as the inspector
(`./ui`).

Hosted eval execution is built in: production and dev identities remain
separate, fixtures receive fresh file URLs, and virtual-clock/fault controls
are accepted only for attested isolated development bots.

## Install

```sh
npm install @holocronlab/botruntime-runtime
```

## Entry points

| Import | Purpose |
| --- | --- |
| `@holocronlab/botruntime-runtime` (or `/library`) | Public library surface: primitives, `Autonomous`, `client`, `analytics`, well-known constants |
| `@holocronlab/botruntime-runtime/runtime` | Wires up an agent implementation (`setup(bot)`); side-effecting entry point used by generated agent projects |
| `@holocronlab/botruntime-runtime/definition` | Schemas/types needed for `bot.definition.ts` files, without runtime side effects |
| `@holocronlab/botruntime-runtime/internal` | Internal functionality used only by `brt` and generated code |
| `@holocronlab/botruntime-runtime/ui` | Minimal span/type exports for UI consumers, kept dependency-light |

## Usage

```ts
import { Conversation, Workflow, Autonomous, client } from '@holocronlab/botruntime-runtime'
```

```ts
import { setup } from '@holocronlab/botruntime-runtime/runtime'

setup(bot) // `bot` comes from @holocronlab/botruntime-sdk
```

## Agent invocation timeout

ADK projects configure the per-invocation timeout in `agent.config.ts`:

```ts
import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  name: 'support-bot',
  maxExecutionTime: 300,
})
```

`maxExecutionTime` is measured in seconds, accepts integers from `1` to `3600`,
and defaults to `120` when omitted. `brt dev` and `brt deploy --adk` send the
same value to their respective bot targets.

## License

MIT — see [LICENSE](./LICENSE).
