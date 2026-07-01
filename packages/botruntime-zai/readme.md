# Zai - AI Operations Made Simple

Zai is a powerful LLM utility library that provides a clean, type-safe API for common AI operations. Built on Zui schemas and the botruntime Cognitive client, it makes AI operations simple, intuitive, and production-ready.

## Key Features

- **Simple API** - One-liner operations for common AI tasks
- **Type Safety** - Full TypeScript support with Zui schema validation
- **Active Learning** - Learn from examples and improve over time
- **Performance** - Built-in retries, caching, and error handling
- **Infinite Documents** - Handle any document size with automatic chunking
- **Usage Tracking** - Monitor tokens, costs, and performance

## Installation

```bash
npm install @holocronlab/botruntime-zai @holocronlab/botruntime-client @holocronlab/botruntime-zui
```

## Quick Start

```typescript
import { Client } from '@holocronlab/botruntime-client'
import { Zai } from '@holocronlab/botruntime-zai'
import { z } from '@holocronlab/botruntime-zui'

// Initialize
const client = new Client({ botId: 'YOUR_BOT_ID', token: 'YOUR_TOKEN' })
const zai = new Zai({ client })

// Extract structured data
const person = await zai.extract(
  'John Doe is 30 years old and lives in New York',
  z.object({
    name: z.string(),
    age: z.number(),
    location: z.string(),
  })
)
// Result: { name: 'John Doe', age: 30, location: 'New York' }

// Check content
const isPositive = await zai.check('This product is amazing!', 'expresses positive sentiment')
// Result: true

// Generate text
const story = await zai.text('Write a short story about AI', { length: 200 })

// Summarize documents
const summary = await zai.summarize(longDocument, { length: 500 })
```

## Core Operations

- `.extract(content, schema, options?)` - Extract structured data
- `.check(content, condition, options?)` - Verify boolean condition
- `.label(content, criteria, options?)` - Apply multiple labels
- `.rewrite(content, instruction, options?)` - Transform text
- `.filter(items, condition, options?)` - Filter array items
- `.group(items, options?)` - Organize items into categories
- `.rate(items, instructions, options?)` - Rate items on 1-5 scale
- `.sort(items, instructions, options?)` - Order items with natural language
- `.text(prompt, options?)` - Generate text
- `.summarize(content, options?)` - Create summary
- `.answer(documents, question, options?)` - Answer questions from documents
- `.patch(content, instructions, options?)` - Apply micropatches to text

### Progress Tracking

```typescript
const response = zai.summarize(veryLongDocument)

response.on('progress', (progress) => {
  console.log(`${progress.requests.percentage * 100}% complete`)
})

const summary = await response
```

### Usage Monitoring

```typescript
const { output, usage } = await zai.extract(text, schema).result()

console.log({
  tokens: usage.tokens.total,
  cost: usage.cost.total,
})
```

### Active Learning

```typescript
const zai = new Zai({
  client,
  activeLearning: {
    enable: true,
    tableName: 'SentimentTable',
    taskId: 'product-reviews',
  },
})

const result = await zai.learn('sentiment').check(review, 'Is this positive?')
```

### Chaining Configuration

```typescript
const fastZai = zai.with({ modelId: 'fast' })
await fastZai.check(text, 'Is this spam?')

const gpt4Zai = zai.with({ modelId: 'openai:gpt-4' })
await gpt4Zai.extract(document, complexSchema)
```

### Custom Abort Signals

```typescript
const controller = new AbortController()
const response = zai.summarize(document).bindSignal(controller.signal)

setTimeout(() => controller.abort(), 5000)
```

## API Reference

### Zai Class

- `new Zai(options)` - Create instance with client and configuration
- `.with(config)` - Create new instance with merged configuration
- `.learn(taskId)` - Enable active learning for specific task

### Response Methods

- `await response` - Get simple result
- `await response.result()` - Get detailed result with metadata
- `await response.usage()` - Get usage statistics (via `.result()`)
- `response.on('progress', handler)` - Track progress
- `response.abort()` - Cancel operation

## License

ISC - See LICENSE file for details
