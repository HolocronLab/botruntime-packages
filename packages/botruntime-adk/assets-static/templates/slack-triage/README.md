# {{projectName}}

A Slack triage bot built with the Botpress ADK. It monitors channels for help requests, classifies them using AI, and routes them to the right person or channel based on configurable routing rules.

## How It Works

1. **Trigger**: A new message arrives in a monitored Slack channel
2. **Classify**: The `classify-request` action uses Zai to categorize the request (bug, feature_request, question, ops_issue)
3. **Route**: The `triage-flow` workflow looks up routing rules from the `RoutingRulesTable` and posts a summary to the appropriate channel or person
4. **Respond**: The Slack DM conversation handler answers follow-up questions about triage status

## Getting Started

1. Install dependencies:

   ```bash
   {{packageManager}} install
   ```

2. Configure Slack:
   - Create a Slack app at https://api.slack.com/apps
   - Add the bot to your workspace
   - Run `adk dev` and configure the Slack integration in the Botpress dashboard

3. Seed routing rules:
   After your first `adk dev`, add rows to the `RoutingRulesTable` via the Botpress dashboard or a script:

   ```
   | category        | assignee       | slackChannel      | priority |
   |-----------------|----------------|-------------------|----------|
   | bug             | @oncall-eng    | #bugs             | high     |
   | feature_request | @product-team  | #feature_requests | medium   |
   | question        | @support-team  | #help-desk        | low      |
   | ops_issue       | @devops        | #ops-alerts       | high     |
   ```

4. Start development server:

   ```bash
   adk dev
   ```

5. Deploy your agent:
   ```bash
   adk deploy
   ```

## Project Structure

- `src/actions/classify-request.ts` - AI-powered request classification
- `src/workflows/triage-flow.ts` - Multi-step triage workflow (classify, lookup, route)
- `src/conversations/slack-dm.ts` - Handles Slack channel messages with AI
- `src/tables/routing-rules.ts` - Configurable routing rules
- `src/triggers/new-message.ts` - Fires on new Slack messages
- `src/knowledge/team-directory.md` - Team directory for AI context

## Customization

### Adding Categories

Edit `src/actions/classify-request.ts` to add new categories to the `category` enum and update the Zai label definitions.

### Changing Routing Logic

Edit `src/workflows/triage-flow.ts` to customize how requests are routed. You can add steps for priority escalation, duplicate detection, or SLA tracking.

### Adding Channels

Create new conversation handlers in `src/conversations/` for other Slack channels or platforms (e.g., `slack-channel.ts` for public channel responses).

## Learn More

- [ADK Documentation](https://botpress.com/docs/adk)
- [Botpress Platform](https://botpress.com)
