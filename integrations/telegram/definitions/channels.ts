import { z, messages } from '@botpress/sdk'

const _textMessageDefinition = {
  ...messages.defaults.text,
  schema: messages.defaults.text.schema.extend({
    text: messages.defaults.text.schema.shape.text
      .max(4096)
      .describe('The text content of the Telegram message (Limit 4096 characters)'),
  }),
}

const _imageMessageDefinition = {
  ...messages.defaults.image,
  schema: messages.defaults.image.schema.extend({
    caption: z.string().optional().describe('The caption/description of the image'),
  }),
}

const _audioMessageDefinition = {
  ...messages.defaults.audio,
  schema: messages.defaults.audio.schema.extend({
    caption: z.string().optional().describe('The caption/transcription of the audio message'),
  }),
}

const _blocSchema = z.union([
  z.object({ type: z.literal('text'), payload: _textMessageDefinition.schema }),
  z.object({ type: z.literal('image'), payload: _imageMessageDefinition.schema }),
  z.object({ type: z.literal('audio'), payload: _audioMessageDefinition.schema }),
  z.object({ type: z.literal('video'), payload: messages.defaults.video.schema }),
  z.object({ type: z.literal('file'), payload: messages.defaults.file.schema }),
  z.object({ type: z.literal('location'), payload: messages.defaults.location.schema }),
])

const _blocMessageDefinition = {
  ...messages.defaults.bloc,
  schema: z.object({
    items: z.array(_blocSchema),
  }),
}

// GAP (request_contact): a one-tap "share phone" reply keyboard. Not present in @botpresshub/telegram
// (its outbound only knows inline url/callback buttons). Needed for our consent-once + share-phone
// flow. The bot sends `type: 'contactRequest'`; the handler renders a one-time reply keyboard with a
// single Telegram requestContact button. The tap comes back as an inbound `contact` update (handled
// in src/misc/utils.ts) carrying the phone number.
const _contactRequestMessageDefinition = {
  schema: z.object({
    text: z.string().min(1).max(4096).describe('Prompt shown above the share-contact button'),
    buttonLabel: z
      .string()
      .optional()
      .describe('Label of the share-contact button (default "Поделиться номером")'),
  }),
}

export const telegramMessageChannels = {
  ...messages.defaults,
  text: _textMessageDefinition,
  image: _imageMessageDefinition,
  audio: _audioMessageDefinition,
  bloc: _blocMessageDefinition,
  contactRequest: _contactRequestMessageDefinition,
}
