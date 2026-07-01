import { DataSource as DataSourceBase, createSyncWorkflow } from './source-base'

import { TableSource } from './source-table'
import { WebsiteSource } from './source-website'
import { DirectorySource } from './source-directory'

export type DataSource = TableSource | WebsiteSource | DirectorySource

export function isDirectorySource(source: DataSourceBase): source is DirectorySource {
  return source.type === 'document'
}

export function isWebsiteSource(source: DataSourceBase): source is WebsiteSource {
  return source.type === 'web-page'
}

export function isTableSource(source: DataSourceBase): source is TableSource {
  return source.type === 'table'
}

// Export base class and utilities for creating custom data sources
export { DataSourceBase, TableSource, WebsiteSource, DirectorySource, createSyncWorkflow }

// Website helper utilities, reusable when composing a custom WebsiteSource subclass
export {
  groupUrlErrors,
  isLikelySitemapUrl,
  looksLikeUnrenderedSpa,
  MAX_ERROR_EXAMPLES_PER_GROUP,
} from './source-website'
export { fetchHtml, extractHtmlMetadata, resolveUrl } from './html-fetch'

// Export types needed for custom data source implementations
export type { Item, SyncInput, SyncOutput, ExtraFileTags, BaseFileTags } from './source-base'
export type { SitemapUrl, FetchResult, FetchStrategy, FetchOption } from './source-website'
export type { HtmlMetadata, FetchHtmlResult } from './html-fetch'
