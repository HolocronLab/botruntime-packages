// Local equivalent of the `.botpress` codegen, mirroring integrations/megaplan/src/bp.ts: it binds
// the integration's config/handler types WITHOUT importing the generated `.botpress` dir, so the
// source is tsc-clean standalone and bundles with `bun build` (we do not run `bp build`; its
// CLI/SDK pair is codegen-broken in this repo). The runtime `Integration` is constructed from
// @botpress/sdk directly (src/index.ts) and cast to IntegrationProps — exactly the yadisk pattern.
import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'

export type Configuration = {
  botToken?: string
  typingIndicatorEmoji?: boolean
}

export type Logger = IntegrationLogger
// Only the fields the handlers actually read; the SDK passes a richer ctx at runtime.
export type Context = { integrationId: string; configuration: Configuration }
