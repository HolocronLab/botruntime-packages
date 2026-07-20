import { z, messages } from '@holocronlab/botruntime-sdk'

const storedMediaFields = {
  fileId: z.string().min(1).optional().describe('Stable private Botruntime Files API id'),
  filename: z.string().min(1).optional().describe('Filename declared by Telegram'),
  contentType: z.string().min(1).optional().describe('Content type declared by Telegram; not signature validation'),
  size: z.number().min(0).optional().describe('Stored byte size'),
  providerFileId: z.string().min(1).optional().describe('Telegram file_id used to download the media'),
  providerFileUniqueId: z.string().min(1).optional().describe('Telegram stable file_unique_id'),
  providerMessageId: z.string().min(1).optional().describe('Telegram message_id carrying the media'),
  providerMediaGroupId: z.string().min(1).optional().describe('Telegram media_group_id for album membership'),
}

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
    ...storedMediaFields,
  }),
}

const _audioMessageDefinition = {
  ...messages.defaults.audio,
  schema: messages.defaults.audio.schema.extend({
    caption: z.string().optional().describe('The caption/transcription of the audio message'),
    ...storedMediaFields,
  }),
}

const _videoMessageDefinition = {
  ...messages.defaults.video,
  schema: messages.defaults.video.schema.extend(storedMediaFields),
}

const _fileMessageDefinition = {
  ...messages.defaults.file,
  schema: messages.defaults.file.schema.extend(storedMediaFields),
}

const _blocSchema = z.union([
  z.object({ type: z.literal('text'), payload: _textMessageDefinition.schema }),
  z.object({ type: z.literal('image'), payload: _imageMessageDefinition.schema }),
  z.object({ type: z.literal('audio'), payload: _audioMessageDefinition.schema }),
  z.object({ type: z.literal('video'), payload: _videoMessageDefinition.schema }),
  z.object({ type: z.literal('file'), payload: _fileMessageDefinition.schema }),
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
  video: _videoMessageDefinition,
  file: _fileMessageDefinition,
  bloc: _blocMessageDefinition,
  contactRequest: _contactRequestMessageDefinition,
}
