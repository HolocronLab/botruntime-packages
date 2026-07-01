# LLMz

**Stop chaining tools. Start generating code.**

LLMz is a TypeScript AI agent framework that replaces traditional JSON tool calling with executable
code generation. Instead of orchestrating tools through multiple LLM roundtrips, agents write and
execute TypeScript directly, enabling complex logic, loops, and multi-tool coordination in a single pass.

Self-contained fork published as `@holocronlab/botruntime-llmz`, built on top of
`@holocronlab/botruntime-zui`, `@holocronlab/botruntime-cognitive` and `@holocronlab/botruntime-client`.

## The Problem with Tool Calling

Traditional agentic frameworks (LangChain, CrewAI, MCP servers) rely on JSON tool calling:

```json
{
  "tool": "getTicketPrice",
  "parameters": { "from": "quebec", "to": "new york" }
}
```

This breaks down quickly:

- **Verbose schemas**: LLMs struggle with complex JSON structures
- **No logic**: Can't express conditionals, loops, or error handling
- **Multiple roundtrips**: Each tool call requires another LLM inference ($$$)

LLMz replaces this with direct code generation: the agent writes a small TypeScript program against
a typed `tools.d.ts` surface, and the program runs inside a sandboxed VM (Node worker or QuickJS).

## Installation

```bash
npm install --save @holocronlab/botruntime-llmz @holocronlab/botruntime-cognitive @holocronlab/botruntime-client @holocronlab/botruntime-zui
```

## Basic Usage

```ts
import { execute, Tool } from '@holocronlab/botruntime-llmz'
import { Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-zui'

const client = new Client({ token: 'your-token', botId: 'your-bot-id' })

const getWeather = new Tool({
  name: 'getWeather',
  input: z.object({ city: z.string() }),
  output: z.object({ celsius: z.number() }),
  handler: async ({ city }) => ({ celsius: 21 }),
})

const result = await execute({
  client,
  instructions: 'You are a helpful assistant',
  tools: [getWeather],
})
```

See `src/index.ts` for the full public API surface (`Tool`, `Exit`, `Component`, `Chat`, `execute`, `init`, ...).
