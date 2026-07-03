# {{projectName}}

A support bot built with the Botpress ADK. It handles common questions autonomously and escalates to a support agent via [Botpress Desk](https://botpress.com/docs/adk/advanced/desk-hitl) when needed.

## How It Works

1. **Conversation**: The bot greets users and answers their questions via webchat
2. **Escalation**: When the user asks for a support agent (or the issue is too complex), the bot calls `handToSupport`, which creates a Botpress Desk ticket and transfers the conversation
3. **Handoff**: A support agent takes over in Botpress Desk — the bot stays silent until the session ends

## Getting Started

1. Install dependencies:

   ```bash
   {{packageManager}} install
   ```

2. Start the development server:

   ```bash
   adk dev
   ```

3. Deploy your bot (required before connecting to Botpress Desk):

   ```bash
   adk deploy
   ```

4. Connect your bot in Botpress Desk:
   - Open Botpress Desk → **AI Bots** → **Deflecting Bots**
   - Add your deployed bot to enable escalations

   > **Important:** `handToSupport` will fail if the bot is not connected in Botpress Desk settings.

## Project Structure

- `src/conversations/index.ts` — Main conversation handler with the `handToSupport` tool
- `src/tools/handToSupport.ts` — Tool that triggers the handoff to Botpress Desk
- `src/knowledge/` — Add FAQ files here (`.md`, `.txt`, `.pdf`) to reduce escalations
- `src/actions/` — Add reusable actions here
- `src/workflows/` — Add long-running workflows here
- `src/triggers/` — Add event-driven triggers here

## Customization

### Changing the Escalation Conditions

Edit the `instructions` in `src/conversations/index.ts` to control when the bot escalates:

```typescript
instructions: `You are a helpful support bot.
You can only help with billing and account questions.
For technical issues, always escalate to a support agent.`
```

### Adding a Knowledge Base

Uncomment the knowledge base in `src/knowledge/index.ts` and drop `.md` or `.txt` files into the folder with your product FAQs. The bot will search them automatically before escalating, reducing ticket volume.

### Customizing Handoff Messages

Configure the messages users see during a handoff in `agent.config.ts`:

```typescript
dependencies: {
  plugins: {
    'desk-hitl': {
      version: 'desk-hitl@latest',
      config: {
        agentAssignedMessage: 'A support agent has joined the conversation.',
        sessionEndedMessage: 'The support session has ended. Let me know if you need anything else.',
      },
    },
  },
},
```

### Reacting to Botpress Desk Activity

Uncomment the trigger in `src/triggers/index.ts` to run logic when a support agent adds a comment or note to a ticket.

## Learn More

- [Botpress Desk HITL Documentation](https://botpress.com/docs/adk/advanced/desk-hitl)
- [ADK Documentation](https://botpress.com/docs/adk)
