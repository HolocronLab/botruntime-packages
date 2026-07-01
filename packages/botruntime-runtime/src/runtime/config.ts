import { limitConfigs } from '@holocronlab/botruntime-const'

const Transcript = {
  /** How many messages will be preserved in the transcript before summarization */
  SUMMARY_MAX_MESSAGES: 50,
  /** How many messages will be preserved at the end of the transcript for higher-precision recall of recent messages */
  SUMMARY_END_PADDING: 10,
  /** Max transcript size in bytes before summarization */
  SUMMARY_MAX_BYTES: limitConfigs.state_item_payload_bytes.value * 0.8,
  /** Target token length passed to `zai.summarize` (maps to `maxTokens` in the underlying generation) */
  SUMMARY_TARGET_TOKENS: 1000,

  /** Max bytes for a single message in the transcript */
  TRANSCRIPT_ITEM_MAX_BYTES: 10_000,
} as const

const Analysis = {
  /** How frequently the analysis will be run */
  ANALYSIS_FREQUENCY_CRON: '*/5 * * * *', // Every 5 minutes

  /** How many conversations to process in parallel */
  CONCURRENT_ANALYSIS_LIMIT: 5,
}

export const Config = {
  Transcript,
  Analysis,
}
