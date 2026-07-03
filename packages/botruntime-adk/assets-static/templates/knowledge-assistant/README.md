# {{projectName}}

A RAG-powered knowledge assistant built with Botpress ADK. This agent answers questions using your documents, with source citations for every response.

## How It Works

1. **Knowledge Base**: Documents in `src/knowledge/` are indexed for semantic search
2. **Conversations**: When a user asks a question, the AI searches the knowledge base for relevant passages
3. **Citations**: Responses include references to the source documents used

## Getting Started

1. Install dependencies:

   ```bash
   {{packageManager}} install
   ```

2. Add your documents to `src/knowledge/` (markdown, PDF, or text files)

3. Start development server:

   ```bash
   adk dev
   ```

4. Deploy your agent:
   ```bash
   adk deploy
   ```

## Adding Documents

Place your documents in `src/knowledge/`. Supported formats:

- Markdown (`.md`)
- PDF (`.pdf`)
- Text (`.txt`)

The knowledge base automatically indexes all supported files. After adding new documents, run `adk kb sync` or restart `adk dev` to re-index.

## Project Structure

- `src/knowledge/docs.ts` - Knowledge base definition
- `src/knowledge/*.md` - Your source documents
- `src/conversations/index.ts` - Conversation handler with RAG execution
- `src/actions/` - Add custom actions (e.g. programmatic KB search for API access)
- `src/tables/` - Data storage (extend as needed)
- `src/triggers/` - Event subscriptions (extend as needed)
- `src/workflows/` - Long-running processes (extend as needed)

## How Citations Work

The conversation handler passes the knowledge base to `execute()`. The AI automatically searches relevant documents when answering questions and cites its sources. This is handled by the Botpress runtime -- no manual citation logic is required.

## Customization

- **Model**: Change `defaultModels` in `agent.config.ts` to use a different LLM
- **Instructions**: Edit the `instructions` in `src/conversations/index.ts` to change the agent's personality
- **Knowledge sources**: Add website crawling or table-based sources in `src/knowledge/docs.ts`
- **Tools**: Convert the search action to a tool with `.asTool()` for more control

## Learn More

- [ADK Documentation](https://botpress.com/docs/adk)
- [Botpress Platform](https://botpress.com)
