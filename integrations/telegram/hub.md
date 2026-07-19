<iframe src="https://www.youtube.com/embed/w0-UGm4mu74"></iframe>

The Telegram integration allows your AI-powered chatbot to seamlessly interact with Telegram, a popular messaging platform with a large user base. Connect your chatbot to Telegram and engage with your audience in real-time conversations. With this integration, you can automate customer support, provide personalized recommendations, send notifications, and handle inquiries directly within Telegram. Leverage Telegram's rich features, including text messages, inline buttons, media files, and more, to create dynamic and interactive chatbot experiences. Empower your chatbot to deliver exceptional user experiences on Telegram with the Telegram Integration for Botpress.

## Migrating from version `0.x.x` to `1.x.x`

### Removal of proactive conversations (and proactive users)

- Telegram does not currently support proactive conversations, so any bots using this feature will need to be updated to use the normal conversation flow.

### Removal of dedicated Markdown messages type

- The `markdown` channel message type is being deprecated in favor of integrating this behavior into the base `text` message type.
- This new Markdown behavior (commonmark spec) will allow image Markdown. However, since Telegram does not support mixed message types, it will split the message into multiple messages with images sent in between text messages.

### Addition of message limits

- Telegram has a message length limit of 4096 characters, so that limit has been added to the text parameter in the `text` message payload. Going over this limit will result in the message being rejected.

## Configuration

In order to receive a bot token, you will need to message the telegram BotFather account at [telegram.me/BotFather](https://telegram.me/BotFather).

1. Message '/start' to telegram.me/BotFather.
2. Message '/newbot' to initiate new bot token creation.
3. Send a message with the title of your new bot.
4. Send a message with the username of your new bot. Please make sure it ends with 'bot'.
5. The BotFather account will respond with message containing your bot token.
6. Paste the bot token in the "Bot Token" field in the Botruntime Telegram configuration.

## Forum topics

Version 1.1.5 adds the `createForumTopic` action for forum-enabled Telegram supergroups. The action
returns both the Telegram `threadId` and a routing-bound Botruntime `conversationId`; inbound and
outbound messages for that conversation stay inside the topic. The bot must be a supergroup
administrator with permission to manage topics.

## Protected media

Version 1.1.7 delivers images, audio, video, documents, and card images from Botruntime's protected
file store without exposing runtime credentials. The integration downloads the canonical file URL
with the bot's credentials and uploads the bytes to Telegram; public third-party URLs keep using
Telegram's normal URL delivery.

## Service messages and transport errors

Version 1.1.8 acknowledges Telegram service messages, such as membership changes, without turning
them into user content or making Telegram retry the webhook. Telegram API network failures remain
real JavaScript errors, preserving their original cause in the Bun integration host.

## Webhook retries

Version 1.1.9 identifies an inbound delivery by the installation webhook and Telegram `update_id`.
Version 1.1.10 reports outbound delivery as `failed` only before provider acceptance or after a definitive provider rejection. A timeout after calling Telegram is `outcome_unknown`: the platform records it but never retries the non-idempotent send automatically. A successful Telegram response is acknowledged with provider message tags.

Version 1.1.11 uploads protected documents with the runtime's native proxied `fetch` multipart transport. This keeps authenticated Botruntime file URLs private and makes binary uploads use the same egress gateway contract as other provider calls under Bun.
Telegram retries are acknowledged without creating a second Botruntime message or running the bot
twice; `message_id` remains the transport anchor for replies and reactions.
