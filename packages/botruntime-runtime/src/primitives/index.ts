export type { Asset, AssetsGlobal } from '../_types/assets'

export * from './workflow-instance'
export * from './conversation-instance'
export * from './user-instance'
export * from './reference'

import { Definitions as _Definitions } from './definition'
import * as _DataSources from './data-sources/index'

import { BaseConversation as _BaseConversation, Typings as _ConversationTypings } from './conversation'

import { BaseConversationInstance as _BaseConversationInstance } from './conversation-instance'

import { BaseKnowledge as _BaseKnowledge, Typings as _KnowledgeTypings } from './knowledge'

import { BaseWorkflow as _BaseWorkflow, Typings as _WorkflowTypings } from './workflow'

import { BaseAction as _BaseAction, Typings as _ActionTypings } from './action'

import { BaseTable as _BaseTable, Typings as _TableTypings } from './table'

import { Trigger as _BaseTrigger, Typings as _TriggerTypings } from './trigger'
import { BaseCustomComponent as _BaseCustomComponent, Typings as _CustomComponentTypings } from './custom-component'
import { ZuiType } from '../types'

export namespace Primitives {
  export import Definitions = _Definitions
  export import Conversation = _ConversationTypings
  export import Knowledge = _KnowledgeTypings
  export import Workflow = _WorkflowTypings
  export import Action = _ActionTypings
  export import Table = _TableTypings
  export import Trigger = _TriggerTypings
  export import CustomComponent = _CustomComponentTypings
}

export { BaseConversation as Conversation } from './conversation'
export {
  BaseKnowledge as Knowledge,
  type KnowledgeSearchResult,
  type KnowledgeSearchPassage,
  type KnowledgePassageMetadata,
  type KnowledgeSearchOptions,
} from './knowledge'

export class Action<TInput extends ZuiType, TOutput extends ZuiType> extends _BaseAction<TInput, TOutput> {}

export { BaseTable as Table } from './table'
export { BaseWorkflow as Workflow } from './workflow'
export { Trigger } from './trigger'
export { BaseCustomComponent as CustomComponent } from './custom-component'

export namespace DataSource {
  export const createSyncWorkflow = _DataSources.createSyncWorkflow
  export const Table = _DataSources.TableSource
  export const Website = _DataSources.WebsiteSource
  export const Directory = _DataSources.DirectorySource
  export const isDirectory = _DataSources.isDirectorySource
  export const isWebsite = _DataSources.isWebsiteSource
  export const isTable = _DataSources.isTableSource
  export type Any = _DataSources.DataSource
  // Base class for extending
  export const Base = _DataSources.DataSourceBase
  // Type aliases for narrowed source types
  export type DirectorySource = _DataSources.DirectorySource
  export type WebsiteSource = _DataSources.WebsiteSource
  export type TableSource = _DataSources.TableSource
  // Types for custom data source implementations
  export type Item = _DataSources.Item
  export type SyncInput = _DataSources.SyncInput
  export type SyncOutput = _DataSources.SyncOutput
  export type ExtraFileTags = _DataSources.ExtraFileTags
  export type BaseFileTags = _DataSources.BaseFileTags
  // Website helpers + types, reusable when composing a custom WebsiteSource subclass
  export const fetchHtml = _DataSources.fetchHtml
  export const extractHtmlMetadata = _DataSources.extractHtmlMetadata
  export const resolveUrl = _DataSources.resolveUrl
  export const groupUrlErrors = _DataSources.groupUrlErrors
  export const isLikelySitemapUrl = _DataSources.isLikelySitemapUrl
  export const looksLikeUnrenderedSpa = _DataSources.looksLikeUnrenderedSpa
  export type SitemapUrl = _DataSources.SitemapUrl
  export type FetchResult = _DataSources.FetchResult
  export type FetchStrategy = _DataSources.FetchStrategy
  export type FetchOption = _DataSources.FetchOption
  export type HtmlMetadata = _DataSources.HtmlMetadata
  export type FetchHtmlResult = _DataSources.FetchHtmlResult
}
