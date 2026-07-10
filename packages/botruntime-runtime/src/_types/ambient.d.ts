/**
 * Ambient seed declarations for this package's "virtual" `_types/*` modules.
 *
 * `src/_types/*.ts` (aside from `assets.ts` and `dependencies.ts`, which are
 * concrete) each import a same-named type from
 * `@holocronlab/botruntime-runtime/_types/<name>` and fall back to it (see the
 * `X extends never ? never : X` pattern in every such file). That module
 * specifier is never meant to resolve to a real file — it's a placeholder that
 * bot-project code generation (`brt`'s `.adk/*.d.ts` compatibility output) augments
 * with the bot's actual, concrete types via its own `declare module` block for
 * the exact same literal specifier, which TypeScript then prefers over this
 * default.
 *
 * Without any augmentation (e.g. compiling this package standalone, as here),
 * these ambient declarations are what make the self-referencing imports
 * resolve at all. Each one defaults to `any` rather than `never`: under
 * `X extends never ? never : X`, `any` distributes to `never | any`, which
 * collapses back to `any` — so unaugmented consumers (and this package's own
 * compilation) get a permissive `any` instead of `never` poisoning every
 * generic that keys off these types (indexing, assignments, etc. all break
 * once a type parameter resolves to `never`). Real codegen'd augmentation
 * (an exact-literal `declare module` block for the same specifier) replaces
 * `any` with the bot's concrete, narrow types.
 *
 * This file is intentionally a `.d.ts` (not `.ts`): ambient declaration files
 * are pure type-checking context and are never re-emitted by
 * `tsc --emitDeclarationOnly`, so it does not appear as its own file in
 * `dist/` (matching upstream's shipped output, which has no such file either).
 */

declare module '@holocronlab/botruntime-runtime/_types/actions' {
  export type BotActions = any
}

declare module '@holocronlab/botruntime-runtime/_types/channels' {
  export type Channels = any
  export type ChannelSpec = any
}

declare module '@holocronlab/botruntime-runtime/_types/components' {
  export type CustomComponentMessage = any
}

declare module '@holocronlab/botruntime-runtime/_types/configuration' {
  export type Configuration = any
}

declare module '@holocronlab/botruntime-runtime/_types/conversations' {
  export type ConversationDefinitions = any
  export type ConversationRoutableEvents = any
}

declare module '@holocronlab/botruntime-runtime/_types/events' {
  export type Events = any
  export type EventName = any
  export type EventPayload<T> = any
}

declare module '@holocronlab/botruntime-runtime/_types/integration-actions' {
  export type IntegrationActions = any
}

declare module '@holocronlab/botruntime-runtime/_types/integrations' {
  export type Integrations = any
}

declare module '@holocronlab/botruntime-runtime/_types/plugin-actions' {
  export type PluginActions = any
}

declare module '@holocronlab/botruntime-runtime/_types/plugins' {
  export type Plugins = any
}

declare module '@holocronlab/botruntime-runtime/_types/secrets' {
  export type Secrets = any
}

declare module '@holocronlab/botruntime-runtime/_types/state' {
  export type BotState = any
  export type UserState = any
}

declare module '@holocronlab/botruntime-runtime/_types/tables' {
  export type TableDefinitions = any
}

declare module '@holocronlab/botruntime-runtime/_types/tags' {
  export type BotTags = any
  export type UserTags = any
  export type ConversationTags = any
  export type MessageTags = any
  export type WorkflowTags = any
}

declare module '@holocronlab/botruntime-runtime/_types/triggers' {
  export type Triggers = any
}

declare module '@holocronlab/botruntime-runtime/_types/workflows' {
  export type WorkflowDefinitions = any
}
