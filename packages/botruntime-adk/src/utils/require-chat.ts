/**
 * Loads @holocronlab/botruntime-chat from a self-contained CJS bundle that ships with the CLI.
 *
 * ## Why we don't import @holocronlab/botruntime-chat directly via ESM
 *
 * @holocronlab/botruntime-chat ships two bundles:
 * - index.mjs (browser): axios fully inlined with its http adapter set to null
 * - index.cjs (node): externalizes require("axios") with the working http adapter
 *
 * ESM `import('@holocronlab/botruntime-chat')` resolves via `module` -> index.mjs -> broken adapter.
 * CJS `require('@holocronlab/botruntime-chat')` resolves via `main` -> index.cjs -> working adapter.
 *
 * In a bun-compiled binary, `import.meta.url` is a `/$bunfs/...` path with no
 * node_modules, and dynamic `createRequire(...)('@holocronlab/botruntime-chat')` doesn't get
 * statically resolved by bun-compile. Anchoring at the user's cwd would force every
 * project to declare @holocronlab/botruntime-chat as a dep — plumbing we'd rather not leak into
 * user templates.
 *
 * ## What we do instead
 *
 * `scripts/build-chat-bundle.ts` produces `dist/chat-bundle.cjs` — a self-contained
 * CJS bundle of @holocronlab/botruntime-chat with axios and other deps inlined. Importing it as
 * `* as chatBundle` from this ESM module makes bun-compile statically inline the
 * CJS content into the binary at build time. No runtime extraction, no createRequire
 * dance, no user-side dep declaration.
 */
// @ts-expect-error - statically inlined by the bundler at build time
import * as chatBundle from '../../dist/chat-bundle.cjs'
import { AdkError } from '@holocronlab/botruntime-analytics'

export type ChatClient = typeof import('@holocronlab/botruntime-chat').Client

/**
 * Returns the @holocronlab/botruntime-chat Client class. The chat client ships with the CLI
 * binary, so no user-side dep declaration or anchor is needed.
 */
export function getChatClient(): ChatClient {
  // Bun's ESM-from-CJS interop exposes the CJS exports under `default` (and also
  // as named exports). Prefer `default` for explicitness.
  const mod = chatBundle as { default?: { Client: ChatClient }; Client?: ChatClient }
  const Client = mod.default?.Client ?? mod.Client
  if (!Client) {
    throw new AdkError({
      code: 'CHAT_BUNDLE_STALE',
      message: '@holocronlab/botruntime-chat bundle did not expose a Client export — build artifact may be stale.',
    })
  }
  return Client
}
