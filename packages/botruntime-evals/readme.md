# botruntime Evals

Evaluation definitions and runner for brt-based botruntime agents.

Author evals with a small declarative API (`Eval`), then run them against a
live agent through the native platform eval transport and a trace collector. The runner
projects spans into grader-friendly turn data and
graders assert on responses, tool calls, state mutations, workflow spans, and
timing — including an optional LLM-judge grader backed by
`@holocronlab/botruntime-zai`.

The authoring contract also supports private file fixtures, synthetic actors
routed to related conversations, delivery/mode assertions, same-target
parallel turns, and isolated-development clock/fault controls.

## Install

```sh
npm install @holocronlab/botruntime-evals
```

## Usage

```ts
import { Eval } from '@holocronlab/botruntime-evals'
import { runEval } from '@holocronlab/botruntime-evals/runner'
import { Client } from '@holocronlab/botruntime-client'

const greeting = new Eval({
  name: 'greeting',
  conversation: [
    {
      message: 'hello',
      assert: {
        response: [{ llm_judge: 'Greets the user back politely' }],
      },
    },
  ],
})

const client = new Client({ token: process.env.BP_TOKEN! })

const report = await runEval(greeting, {
  client,
  botId: process.env.BOT_ID!,
})
```

Local fixture paths are authoring-only. `brt eval` uploads referenced files
with private integration access and stores only file id, name, MIME, size and
sha256 in the hosted manifest; signed URLs and contents are never persisted in
eval results.

## Entry points

- `.` — `Eval` authoring API + shared types
- `./runner` — `runEval` / `runEvalSuite`, the trace-driven execution engine
- `./loader` — discover `*.eval.ts` files from an agent directory
- `./graders`, `./graders/*` — individual grader functions (response, tools,
  state, workflow, timing, outcome, LLM judge)
- `./stores`, `./stores/vortex` — persistence for eval run history
  (local SQLite via `bun:sqlite`, or a remote Vortex-backed store)
- `./spans`, `./sse-collector`, `./trace` — the trace/span primitives the
  runner and graders operate on
- `./client` — a send-only chat session for driving eval conversations
- `createNativeEvalChatClient` — adapter over the authenticated platform chat
  API; uses synthetic incoming messages and requires no integration/provider key
- `./transformer` — projects raw trace spans into grader-friendly turn data
- `./manifest`, `./types`, `./definition` — shared manifest/type/definition
  building blocks

## License

MIT — see [LICENSE](./LICENSE).
