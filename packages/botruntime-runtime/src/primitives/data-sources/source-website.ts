import { DataSource, createSyncWorkflow, Item, SyncInput, SyncOutput } from './source-base'
import type { ExtraFileTags } from './source-base'
import { z } from '@holocronlab/botruntime-sdk'
import { WellKnownMetadata } from '../../constants'
import { XMLParser } from 'fast-xml-parser'
import { context } from '../../runtime/context/context'
import type { WorkflowStep } from '../workflow-step'
import { fetchHtml, type HtmlMetadata } from './html-fetch'
import type { Client } from '@holocronlab/botruntime-client'
import pLimit from 'p-limit'

// =============================================================================
// Types
// =============================================================================

type SitemapFilterContext = {
  url: string
  lastmod?: string
  changefreq?: string
  priority?: string
}

export type FetchResult = {
  url: string
  contentType: string
  content: string
  metadata?: {
    [WellKnownMetadata.knowledge.TITLE]?: string
    [WellKnownMetadata.knowledge.DESCRIPTION]?: string
    [WellKnownMetadata.knowledge.FAVICON]?: string
  }
}

/**
 * Fetch strategy for retrieving page content
 *
 * - 'node:fetch': Uses Node's built-in fetch (fast, no dependencies, works for static HTML)
 * - 'integration:browser': Uses browser integration (slower, requires browser integration, handles JavaScript/SPAs)
 *
 * Note: this only controls how *page bodies* are fetched. Sitemap files (XML)
 * are always retrieved via plain HTTP — the headless browser renders XML as a
 * styled HTML tree view, which breaks XML parsing.
 */
export type FetchStrategy = 'node:fetch' | 'integration:browser'

/**
 * Fetch option can be:
 * - A strategy string: 'node:fetch' or 'integration:browser'
 * - A custom function: for special authentication, headers, or processing
 */
export type FetchOption = FetchStrategy | ((url: string) => Promise<FetchResult> | FetchResult)

type WebsiteSourceOptions = {
  id?: string
  filter?: (context: SitemapFilterContext) => boolean
  /**
   * Fetch method to use for retrieving web *pages* (sitemap files always use plain HTTP)
   *
   * Options:
   * - 'node:fetch': Fast, uses Node's built-in fetch (best for static HTML sites) **[DEFAULT]**
   * - 'integration:browser': Slower, uses browser integration (best for JavaScript/SPAs)
   * - Custom function: Provide your own fetch implementation (for auth, special headers, etc.)
   * - undefined: Defaults to 'node:fetch'
   *
   * @default 'node:fetch'
   *
   * @example
   * // Use Node's built-in fetch (default, can be omitted)
   * { fetch: 'node:fetch' }
   *
   * @example
   * // Use browser integration for JavaScript-heavy sites
   * { fetch: 'integration:browser' }
   *
   * @example
   * // Custom fetch with authentication
   * {
   *   fetch: async (url) => {
   *     const response = await fetch(url, {
   *       headers: { Authorization: 'Bearer token' }
   *     })
   *     return {
   *       url,
   *       contentType: 'text/html',
   *       content: await response.text()
   *     }
   *   }
   * }
   */
  fetch?: FetchOption
  maxPages?: number // min 1, max 50000
  maxDepth?: number // min 1, max 20
  /**
   * Extra tags applied to every file ingested by this source, on top of the
   * well-known KB/source identity tags. Either a static record or a function
   * resolved per upload. Reserved keys (`source`, `kbId`, `kbName`, `dsId`,
   * `dsType`) are ignored. Useful for slot/release labels, ownership, etc.
   *
   * @example { tags: { slot: 'draft' } }
   * @example { tags: () => ({ slot: currentSlot() }) }
   */
  tags?: ExtraFileTags
}

type UrlsSourceOptions = {
  id?: string
  /**
   * Fetch method to use for retrieving web pages
   *
   * See WebsiteSourceOptions.fetch for detailed documentation
   */
  fetch?: FetchOption
  /**
   * Extra tags applied to every file ingested by this source.
   * See WebsiteSourceOptions.tags for detailed documentation.
   */
  tags?: ExtraFileTags
}

type WebsiteSourceMode = 'website' | 'sitemap' | 'urls' | 'llms-txt'

export type SitemapUrl = {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: string
  title?: string
}

type Metadata = {
  [WellKnownMetadata.knowledge.URL]: string
  hash: string
  lastmod?: string
  contentType?: string
  [WellKnownMetadata.knowledge.TITLE]?: string
  [WellKnownMetadata.knowledge.DESCRIPTION]?: string
  [WellKnownMetadata.knowledge.FAVICON]?: string
  dsId: string
  dsType: string
}

type State = z.infer<typeof State>
const State = z.object({
  urls: z
    .array(
      z.object({
        loc: z.string(),
        lastmod: z.string().optional(),
        changefreq: z.string().optional(),
        priority: z.string().optional(),
      })
    )
    .default([]),
  queue: z.array(z.object({ url: z.string(), depth: z.number() })).default([]),
})

// =============================================================================
// Pure helpers (sitemap parsing + heuristics)
// =============================================================================

/**
 * Heuristic for whether a URL looks like it could be a sitemap file.
 *
 * Some sites publish malformed sitemap-indexes that wrap content pages in
 * `<sitemapindex><sitemap>` tags instead of `<urlset><url>`. Without this
 * filter, the BFS crawl tries to fetch each page as a sub-sitemap, the XML
 * parse fails, the TXT fallback scrapes any URLs out of the rendered page,
 * and the loop spirals through marketing pages. The studio's KB scraper
 * uses an equivalent guard (`isSitemapXml` in stratus's `sitemaps.ts`).
 *
 * Trade-off note: the OR between `includes('sitemap')` and `endsWith('.xml')`
 * is intentionally loose. A stricter AND would reject legit sitemaps that
 * don't have "sitemap" in the path (some sites use `/index.xml` or
 * extensionless paths) — that's a worse failure mode (sync misses URLs) than
 * a loose match (one wasted HTTP request when an `<sitemapindex>` entry
 * happens to point at a non-sitemap `.xml` file). We exclude the common
 * non-sitemap XML names (RSS/Atom feeds) explicitly to keep the false-
 * positive rate low without giving up legitimate edge cases.
 */
const KNOWN_NON_SITEMAP_XML = /(?:^|\/)(?:feed|atom|rss)\.xml$/
export function isLikelySitemapUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (KNOWN_NON_SITEMAP_XML.test(path)) return false
    return path.includes('sitemap') || path.endsWith('.xml')
  } catch {
    return false
  }
}

/**
 * Parse sitemap XML content into a list of page URLs and sub-sitemap URLs.
 */
function parseSitemapXml(content: string): { urls: SitemapUrl[]; sitemaps: string[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  })

  let parsed = parser.parse(content)

  // If wrapped in HTML/body tags, unwrap by navigating the structure
  if (parsed.html) {
    parsed = parsed.html.body || parsed.html
  } else if (parsed.body) {
    parsed = parsed.body
  }

  const urls: SitemapUrl[] = []
  const sitemaps: string[] = []

  if (parsed.sitemapindex?.sitemap) {
    const entries = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap]
    for (const entry of entries) {
      if (entry.loc) sitemaps.push(entry.loc)
    }
  }

  if (parsed.urlset?.url) {
    const entries = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url]
    for (const entry of entries) {
      if (entry.loc) {
        urls.push({
          loc: entry.loc,
          lastmod: entry.lastmod,
          changefreq: entry.changefreq,
          priority: entry.priority,
        })
      }
    }
  }

  return { urls, sitemaps }
}

/**
 * Parse a plain-text sitemap (one URL per line).
 */
function parseSitemapTxt(content: string): { urls: SitemapUrl[] } {
  const urls: SitemapUrl[] = []
  for (const line of content.split('\n')) {
    const url = line.trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      urls.push({ loc: url })
    }
  }
  return { urls }
}

/**
 * Parse llms.txt: extract markdown links to .md files.
 */
function parseLlmsTxt(content: string): { urls: { loc: string; title?: string }[] } {
  const urls: { loc: string; title?: string }[] = []
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+\.md)\)/g
  for (const line of content.split('\n')) {
    for (const match of line.matchAll(linkRegex)) {
      const [, title, url] = match
      if (url) urls.push({ loc: url, ...(title && { title }) })
    }
  }
  return { urls }
}

/**
 * Convert HtmlMetadata to FetchResult metadata format.
 */
function htmlMetadataToFetchMetadata(metadata: HtmlMetadata): NonNullable<FetchResult['metadata']> {
  const result: NonNullable<FetchResult['metadata']> = {}
  if (metadata.title) result[WellKnownMetadata.knowledge.TITLE] = metadata.title
  if (metadata.description) result[WellKnownMetadata.knowledge.DESCRIPTION] = metadata.description
  if (metadata.favicon) result[WellKnownMetadata.knowledge.FAVICON] = metadata.favicon
  return result
}

// =============================================================================
// Browser-integration glue (call deployed integration via cloud actions API)
// =============================================================================

type BrowserAction = 'browsePages' | 'discoverUrls'

/**
 * Wrap an error from `client.callAction({ type: 'browser:<action>' })` with
 * actionable guidance. The cloud's response is the source of truth for
 * whether the integration is installed and enabled — this just adds a hint
 * the user can act on without rephrasing the underlying error.
 *
 * The fallback advice is action-specific: for `browsePages` the user can
 * switch to `fetch: 'node:fetch'` (it only governs page bodies); for
 * `discoverUrls` (used by `mode === 'website'`) `node:fetch` doesn't help —
 * the user has to pick a non-crawl mode instead.
 */
function wrapBrowserActionError(action: BrowserAction, err: unknown): Error {
  const original = err instanceof Error ? err.message : String(err)
  const fallback =
    action === 'browsePages'
      ? `Or switch this source to fetch: 'node:fetch' for static HTML sites.`
      : `Or use fromSitemap() / fromUrls() / fromLlmsTxt() to provide URLs without crawling.`
  return new Error(
    `Failed to call browser:${action} via the bot's actions API: ${original}\n\n` +
      `If the 'browser' integration is not installed or enabled on this bot:\n` +
      `  1. Ask the workspace operator to install and register the browser integration on this exact target.\n` +
      `  2. For a dev target, restart \`brt dev\`; for production, rebuild and run \`brt deploy --adk\`.\n` +
      `  3. Re-run the website sync after that same target is ready.\n\n` +
      fallback
  )
}

/**
 * Group per-URL error messages into a compact list of human-readable strings,
 * one entry per distinct error message. Caps example URLs per group so the
 * sync dialog stays readable when many URLs hit the same error (e.g. every
 * page on a site is an unrendered SPA shell, or every sub-sitemap fetch
 * times out). Without this, a 500-URL sitemap with a uniform failure mode
 * would flood the UI with 500 near-identical rows.
 */
export const MAX_ERROR_EXAMPLES_PER_GROUP = 3
export function groupUrlErrors(errorsByUrl: Map<string, string>, prefix: string): string[] {
  if (errorsByUrl.size === 0) return []
  const byMessage = new Map<string, string[]>()
  for (const [url, message] of errorsByUrl) {
    const list = byMessage.get(message) ?? []
    list.push(url)
    byMessage.set(message, list)
  }
  const grouped: string[] = []
  for (const [message, urls] of byMessage) {
    const examples = urls.slice(0, MAX_ERROR_EXAMPLES_PER_GROUP).join(', ')
    const more =
      urls.length > MAX_ERROR_EXAMPLES_PER_GROUP ? ` (+ ${urls.length - MAX_ERROR_EXAMPLES_PER_GROUP} more)` : ''
    const count = urls.length === 1 ? '1 URL' : `${urls.length} URLs`
    grouped.push(`${prefix} — ${count} affected: ${examples}${more}\n${message}`)
  }
  return grouped
}

/**
 * Heuristic: does this HTML response look like an unrendered single-page app
 * shell? When `fetch: 'node:fetch'` is used against a JS-rendered site, the
 * raw response is an empty mount point (e.g. `<div id="root"></div>`) plus
 * script tags that would have populated it in a real browser. Indexing that
 * gets the user nothing useful and is hard to debug.
 *
 * Trigger requires BOTH:
 *  - a recognized SPA mount-point div (root/app/__next/__nuxt/svelte/main)
 *  - very little visible text after stripping scripts/styles/tags
 *
 * The combined check keeps false-positives low — content-rich sites that
 * happen to use `id="app"` won't trigger because they have substantial text.
 */
export function looksLikeUnrenderedSpa(html: string): { isSpa: boolean; textLength: number; htmlLength: number } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const text = stripped
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hasSpaMount = /<div\s+id=["'](?:root|app|__next|__nuxt|svelte|main)["']/i.test(html)
  return { isSpa: hasSpaMount && text.length < 200, textLength: text.length, htmlLength: html.length }
}

type BrowsePagesResult = {
  url: string
  content: string
  raw?: string
  description?: string
  favicon?: string
  title?: string
}

/**
 * Call `browser:browsePages` via the bot's actions API. The runtime helper
 * The generated integration registry's `browser.actions.browsePages(...)` is just
 * sugar over this same call.
 */
async function callBrowserBrowsePages(client: Client, url: string): Promise<BrowsePagesResult> {
  let response: { output: { [k: string]: unknown } }
  try {
    response = await client.callAction({
      type: 'browser:browsePages',
      input: { urls: [url], timeout: 30_000, waitFor: 500 },
    })
  } catch (err) {
    throw wrapBrowserActionError('browsePages', err)
  }

  const result = (response.output as { results?: BrowsePagesResult[] })?.results?.[0]
  if (!result || !result.content) {
    throw new Error(`Failed to fetch content from ${url}`)
  }
  return result
}

type DiscoverUrlsResult = {
  urls: string[]
  excluded?: number
  stopReason?: string
}

/**
 * Call `browser:discoverUrls` via the bot's actions API.
 */
async function callBrowserDiscoverUrls(client: Client, baseUrl: string, maxCount: number): Promise<DiscoverUrlsResult> {
  let response: { output: { [k: string]: unknown } }
  try {
    response = await client.callAction({
      type: 'browser:discoverUrls',
      input: { url: baseUrl, count: Math.min(maxCount, 10_000), onlyHttps: true },
    })
  } catch (err) {
    throw wrapBrowserActionError('discoverUrls', err)
  }

  const output = response.output as { urls?: string[]; excluded?: number; stopReason?: string }
  if (!output?.urls) {
    throw new Error(`Failed to discover URLs from ${baseUrl}`)
  }
  const result: DiscoverUrlsResult = { urls: output.urls }
  if (output.excluded !== undefined) result.excluded = output.excluded
  if (output.stopReason !== undefined) result.stopReason = output.stopReason
  return result
}

// =============================================================================
// WebsiteSource
// =============================================================================

export class WebsiteSource extends DataSource {
  protected mode: WebsiteSourceMode
  protected baseUrl: string | undefined
  protected sitemapUrl: string | undefined
  protected llmsTxtUrl: string | undefined
  protected urls: string[] | undefined
  protected filterFn: ((context: SitemapFilterContext) => boolean) | undefined
  protected customFetch: ((url: string) => Promise<FetchResult> | FetchResult) | undefined
  protected fetchStrategy: FetchStrategy
  protected maxPages: number
  protected maxDepth: number

  public constructor(
    id: string,
    mode: WebsiteSourceMode,
    options: (WebsiteSourceOptions | UrlsSourceOptions) & {
      baseUrl?: string
      sitemapUrl?: string
      llmsTxtUrl?: string
      urls?: string[]
    }
  ) {
    super(id, 'web-page', { tags: options.tags })
    this.mode = mode
    this.baseUrl = options.baseUrl ?? undefined
    this.sitemapUrl = options.sitemapUrl ?? undefined
    this.llmsTxtUrl = options.llmsTxtUrl ?? undefined
    this.urls = options.urls ?? undefined
    this.filterFn = 'filter' in options ? options.filter : undefined

    if (typeof options.fetch === 'string') {
      this.fetchStrategy = options.fetch
      this.customFetch = undefined
    } else if (typeof options.fetch === 'function') {
      this.customFetch = options.fetch
      this.fetchStrategy = 'node:fetch'
    } else {
      this.fetchStrategy = 'node:fetch'
      this.customFetch = undefined
    }

    this.maxPages = Math.max(1, Math.min(('maxPages' in options ? options.maxPages : undefined) ?? 50000, 50000))
    this.maxDepth = Math.max(1, Math.min(('maxDepth' in options ? options.maxDepth : undefined) ?? 20, 20))
  }

  /** Get serializable configuration for change detection (only user-provided options) */
  public getConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      mode: this.mode,
      fetchStrategy: this.fetchStrategy,
    }

    if (this.mode === 'website') {
      config.baseUrl = this.baseUrl
      config.maxPages = this.maxPages
      config.maxDepth = this.maxDepth
    } else if (this.mode === 'sitemap') {
      config.sitemapUrl = this.sitemapUrl
      config.maxPages = this.maxPages
    } else if (this.mode === 'llms-txt') {
      config.llmsTxtUrl = this.llmsTxtUrl
      config.maxPages = this.maxPages
    } else if (this.mode === 'urls') {
      config.urls = this.urls
    }

    if (this.filterFn) {
      config.filterFn = this.filterFn.toString()
    }

    return config
  }

  // ---------------------------------------------------------------------------
  // Client resolution + fetching
  // ---------------------------------------------------------------------------

  /**
   * Resolve a Botpress Client to use for calling deployed integrations.
   *
   * The `brt`-managed sync path passes its authenticated client explicitly through
   * `syncDirect`. The runtime workflow path doesn't thread a client through
   * each call, so we fall back to the client stored in the bot context — the
   * same one used by `runtime/actions.ts` to invoke integration actions.
   */
  protected resolveActionClient(explicit?: Client): Client {
    if (explicit) return explicit
    const ctxClient = context.get('client', { optional: true })
    if (!ctxClient) {
      throw new Error(
        `Cannot call the 'browser' integration: no Botpress client available. ` +
          `Run inside the botruntime worker (\`brt dev\`) or pass a client to syncDirect (CLI path).`
      )
    }
    return ctxClient as unknown as Client
  }

  /**
   * Default fetch implementation using Node's built-in fetch.
   */
  protected async defaultFetch(url: string): Promise<FetchResult> {
    const result = await fetchHtml(url, { timeout: 30_000 })
    if (!result.metadata) {
      return { url: result.url, contentType: result.contentType, content: result.content }
    }
    return {
      url: result.url,
      contentType: result.contentType,
      content: result.content,
      metadata: htmlMetadataToFetchMetadata(result.metadata),
    }
  }

  /**
   * Fetch a sitemap or llms.txt file. Always uses plain HTTP — the headless
   * browser renders XML as styled HTML, breaking sitemap parsing. A user-provided
   * `customFetch` still wins so authenticated XML hosts work, but the strategy
   * fallback never goes through `browser:browsePages`.
   *
   * Mirrors stratus's documents-lambda which uses `axios.get` for sitemap files
   * and only falls back to the scraper (with `disableRendering: true`) when
   * blocked.
   */
  protected async fetchSitemapContent(url: string): Promise<FetchResult> {
    if (this.customFetch) {
      try {
        return await this.customFetch(url)
      } catch {
        console.warn(`Custom fetch failed for ${url}, falling back to node:fetch...`)
      }
    }
    return this.defaultFetch(url)
  }

  /**
   * Fetch a page body for indexing. Honors the configured `fetchStrategy`:
   * `integration:browser` routes through `browser:browsePages` for JS-rendered
   * pages; `node:fetch` (the default) hits the URL directly.
   *
   * On the `node:fetch` path, also checks whether the response looks like an
   * unrendered SPA shell — if so, throws an actionable error pointing the user
   * at `fetch: 'integration:browser'` instead of silently indexing junk.
   */
  protected async fetchPageContent(url: string, explicitClient?: Client): Promise<FetchResult> {
    if (this.customFetch) {
      try {
        return await this.customFetch(url)
      } catch {
        console.warn(`Custom fetch failed for ${url}, falling back to ${this.fetchStrategy}...`)
      }
    }

    if (this.fetchStrategy === 'integration:browser') {
      const client = this.resolveActionClient(explicitClient)
      const result = await callBrowserBrowsePages(client, url)
      return {
        url: result.url,
        contentType: 'text/markdown',
        content: result.content,
        metadata: {
          [WellKnownMetadata.knowledge.TITLE]: result.title!,
          [WellKnownMetadata.knowledge.DESCRIPTION]: result.description!,
          [WellKnownMetadata.knowledge.FAVICON]: result.favicon!,
        },
      }
    }

    const result = await this.defaultFetch(url)

    if (result.contentType.includes('html')) {
      const spaCheck = looksLikeUnrenderedSpa(result.content)
      if (spaCheck.isSpa) {
        // Per-URL details (the URL itself, byte counts) are intentionally NOT
        // in this message — the per-URL aggregator groups by message string,
        // and we want all SPA-shell failures on a site to collapse into one
        // entry in the sync dialog instead of flooding it with N near-
        // identical rows. The affected URL appears in the grouped entry's
        // example list.
        throw new Error(
          `Page response looks like an unrendered JavaScript single-page app — node:fetch returned a near-empty SPA mount-point div without the rendered content.\n\n` +
            `Switch this source to fetch: 'integration:browser' so the deployed browser integration renders the page first:\n` +
            `  DataSource.Website.fromSitemap(url, { fetch: 'integration:browser', ... })`
        )
      }
    }

    return result
  }

  // ---------------------------------------------------------------------------
  // URL discovery
  // ---------------------------------------------------------------------------

  /**
   * Apply the user-provided filter to a list of bare URLs and return SitemapUrl entries.
   */
  private applyFilterToBareUrls(urls: string[]): SitemapUrl[] {
    if (!this.filterFn) return urls.map((url) => ({ loc: url }))

    const passed: SitemapUrl[] = []
    let skipped = 0
    for (const url of urls) {
      if (this.filterFn({ url })) {
        passed.push({ loc: url })
      } else {
        skipped++
        console.log(`Skipped URL (filtered): ${url}`)
      }
    }
    console.log(`Applied filter: ${passed.length} URLs passed, ${skipped} URLs filtered out`)
    return passed
  }

  /**
   * Discover URLs by crawling the website with the browser integration.
   *
   * Used for `mode === 'website'` (no sitemap; we discover URLs by following
   * links). Calls `browser:discoverUrls` via the cloud actions API, so works
   * from both the runtime workflow and the CLI.
   */
  private async discoverUrlsViaBrowser(explicitClient?: Client): Promise<SitemapUrl[]> {
    if (!this.baseUrl) {
      throw new Error('No base URL provided')
    }

    console.log(`Discovering URLs from website: ${this.baseUrl}`)

    const client = this.resolveActionClient(explicitClient)
    const result = await callBrowserDiscoverUrls(client, this.baseUrl, this.maxPages)

    console.log(
      `Discovered ${result.urls.length} URLs, excluded: ${result.excluded ?? 0}, stop reason: ${result.stopReason ?? 'n/a'}`
    )

    return this.applyFilterToBareUrls(result.urls)
  }

  /**
   * BFS-crawl a sitemap tree starting at `startUrl`, calling `fetchSitemap`
   * to retrieve each candidate. Skips sub-sitemap entries that don't look
   * like sitemap files (`isLikelySitemapUrl`) so malformed sitemap-indexes
   * (page URLs wrapped in `<sitemap>` tags) don't poison the queue.
   *
   * Returns the discovered page URLs plus any per-sitemap fetch errors so
   * the caller can surface them in the sync report — without these, sitemap
   * failures are silent from the user's POV.
   */
  private async bfsSitemapCrawl(
    startUrl: string,
    fetchSitemap: (url: string) => Promise<FetchResult>
  ): Promise<{ urls: SitemapUrl[]; errors: string[] }> {
    const urls: SitemapUrl[] = []
    const errorsByUrl = new Map<string, string>()
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 1 }]
    const visited = new Set<string>()
    let skippedByFilter = 0

    while (queue.length > 0 && urls.length < this.maxPages) {
      const item = queue.shift()!
      if (visited.has(item.url)) continue
      visited.add(item.url)

      try {
        const { content, contentType } = await fetchSitemap(item.url)
        console.log(`Fetched sitemap ${item.url} (${content.length} bytes), processing... ${contentType}`)

        try {
          const { urls: parsedUrls, sitemaps } = parseSitemapXml(content)
          console.log(`Parsed ${parsedUrls.length} URLs and ${sitemaps.length} sub-sitemaps from ${item.url}`)

          for (const url of parsedUrls) {
            if (urls.length >= this.maxPages) {
              console.log(`Reached maxPages limit (${this.maxPages}), stopping URL discovery`)
              break
            }
            const filterContext: SitemapFilterContext = {
              url: url.loc,
              ...(url.lastmod && { lastmod: url.lastmod }),
              ...(url.changefreq && { changefreq: url.changefreq }),
              ...(url.priority && { priority: url.priority }),
            }
            if (!this.filterFn || this.filterFn(filterContext)) {
              urls.push(url)
            } else {
              skippedByFilter++
              console.log(`Skipped URL (filtered): ${url.loc}`)
            }
          }

          if (item.depth < this.maxDepth) {
            for (const subSitemap of sitemaps) {
              if (!isLikelySitemapUrl(subSitemap)) {
                console.log(`Skipping non-sitemap entry in <sitemapindex>: ${subSitemap}`)
                continue
              }
              queue.push({ url: subSitemap, depth: item.depth + 1 })
            }
          } else if (sitemaps.length > 0) {
            console.log(`Reached maxDepth limit (${this.maxDepth}), skipping ${sitemaps.length} sub-sitemaps`)
          }
        } catch {
          console.log(`XML parsing failed for ${item.url}, trying TXT format...`)
          const { urls: txtUrls } = parseSitemapTxt(content)
          for (const url of txtUrls) {
            if (urls.length >= this.maxPages) {
              console.log(`Reached maxPages limit (${this.maxPages}), stopping URL discovery`)
              break
            }
            if (!this.filterFn || this.filterFn({ url: url.loc })) {
              urls.push(url)
            } else {
              skippedByFilter++
              console.log(`Skipped URL (filtered): ${url.loc}`)
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Failed to process sitemap ${item.url}: ${message}`)
        errorsByUrl.set(item.url, message)
      }
    }

    console.log(
      `URL discovery complete: ${urls.length} URLs discovered, ${skippedByFilter} URLs skipped by filter, ${errorsByUrl.size} sitemaps failed`
    )
    if (urls.length >= this.maxPages) {
      console.log(`Note: Discovery stopped at maxPages limit (${this.maxPages})`)
    }
    return {
      urls: urls.slice(0, this.maxPages),
      errors: groupUrlErrors(errorsByUrl, 'Sitemap discovery failed'),
    }
  }

  /**
   * Filter llms.txt entries by the user-provided filter (if any), capped at maxPages.
   */
  private applyFilterToLlmsTxtUrls(urls: { loc: string; title?: string }[]): SitemapUrl[] {
    const filtered: SitemapUrl[] = []
    for (const url of urls) {
      if (filtered.length >= this.maxPages) {
        console.log(`Reached maxPages limit (${this.maxPages}), stopping`)
        break
      }
      if (!this.filterFn || this.filterFn({ url: url.loc })) {
        filtered.push(url)
      } else {
        console.log(`Skipped URL (filtered): ${url.loc}`)
      }
    }
    return filtered
  }

  /**
   * Discover URLs for the workflow path (resumable, observable via `step()`).
   * The workflow-level `state` schema is still defined for `createSyncWorkflow`
   * — workflow persistence/resumption needs a known shape — but URL discovery
   * itself accumulates locally inside `bfsSitemapCrawl`, so this method
   * doesn't take `state` as a parameter.
   */
  protected async discoverUrls(step: WorkflowStep): Promise<{ urls: SitemapUrl[]; errors: string[] }> {
    if (this.mode === 'urls') {
      if (!this.urls || this.urls.length === 0) throw new Error('No URLs provided')
      console.log(`Using provided URL list: ${this.urls.length} URLs`)
      return { urls: this.urls.map((url) => ({ loc: url })), errors: [] }
    }

    if (this.mode === 'website') {
      const urls = await step('discover urls from website', () => this.discoverUrlsViaBrowser())
      return { urls, errors: [] }
    }

    if (this.mode === 'llms-txt') {
      if (!this.llmsTxtUrl) throw new Error('No llms.txt URL provided')
      const { content } = await step('fetch llms.txt', () => this.fetchSitemapContent(this.llmsTxtUrl!))
      const { urls } = parseLlmsTxt(content)
      console.log(`Parsed ${urls.length} URLs from llms.txt`)
      return { urls: this.applyFilterToLlmsTxtUrls(urls), errors: [] }
    }

    if (!this.sitemapUrl) throw new Error('No sitemap URL provided')
    return this.bfsSitemapCrawl(this.sitemapUrl, (url) =>
      step(`processing sitemap ${url}`, () => this.fetchSitemapContent(url))
    )
  }

  /**
   * Discover URLs for the CLI path (one-shot, no workflow steps).
   */
  protected async discoverUrlsDirect(client?: Client): Promise<{ urls: SitemapUrl[]; errors: string[] }> {
    if (this.mode === 'urls') {
      if (!this.urls || this.urls.length === 0) throw new Error('No URLs provided')
      console.log(`Using provided URL list: ${this.urls.length} URLs`)
      return { urls: this.urls.map((url) => ({ loc: url })), errors: [] }
    }

    if (this.mode === 'website') {
      const urls = await this.discoverUrlsViaBrowser(client)
      return { urls, errors: [] }
    }

    if (this.mode === 'llms-txt') {
      if (!this.llmsTxtUrl) throw new Error('No llms.txt URL provided')
      const { content } = await this.fetchSitemapContent(this.llmsTxtUrl)
      const { urls } = parseLlmsTxt(content)
      console.log(`Parsed ${urls.length} URLs from llms.txt`)
      return { urls: this.applyFilterToLlmsTxtUrls(urls), errors: [] }
    }

    if (!this.sitemapUrl) throw new Error('No sitemap URL provided')
    return this.bfsSitemapCrawl(this.sitemapUrl, (url) => this.fetchSitemapContent(url))
  }

  // ---------------------------------------------------------------------------
  // Sync workflows
  // ---------------------------------------------------------------------------

  public get syncWorkflow() {
    return createSyncWorkflow({
      type: 'website' as const,
      state: State,
      async handler(this: WebsiteSource, { input, step, client }) {
        const crypto = await import('crypto')

        console.log(
          `Starting sync for WebsiteSource [${this.id}] in mode [${this.mode}, maxPages=${this.maxPages}, maxDepth=${this.maxDepth}, baseUrl=${this.baseUrl}, sitemapUrl=${this.sitemapUrl}]`
        )
        console.log(`Using knowledge base: ${input.kbName}, force reindex: ${!!input.force}, ${input.dsId}`)
        if (input.force) {
          console.log('🔄 FORCE MODE: Re-indexing all files regardless of changes')
        }

        const scopeTags = this.baseFileTags(input)
        const tags = this.fileTags(input)

        const { urls: discoveredUrls, errors: discoveryErrors } = await step('discover urls from sitemap', () =>
          this.discoverUrls(step)
        )

        console.log(`Discovered ${discoveredUrls.length} URLs from sitemap`)
        console.log(`Will process up to ${this.maxPages} pages`)

        const existingFiles = await step('list existing files', () =>
          client._inner.list.files({ tags: scopeTags }).collect()
        )

        if (input.force && existingFiles.length > 0) {
          console.warn(
            `⚠️  Website source configuration changed - deleting ${existingFiles.length} existing files and recrawling`
          )
          await step.map(
            'deleting all existing files for recrawl',
            existingFiles,
            (f) => client.deleteFile({ id: f.id }).catch(() => null),
            { concurrency: 5 }
          )
          console.log(`✅ Deleted ${existingFiles.length} files, starting fresh crawl`)
        }

        const existingFileMap = input.force
          ? new Map<string, (typeof existingFiles)[number]>()
          : new Map(existingFiles.map((f) => [(f.metadata as Metadata)?.[WellKnownMetadata.knowledge.URL], f]))

        const toRemove = input.force
          ? []
          : existingFiles.filter(
              (f) => !discoveredUrls.find((u) => u.loc === (f.metadata as Metadata)?.[WellKnownMetadata.knowledge.URL])
            )

        const toFetch: SitemapUrl[] = []
        const toUpdateTags: Array<(typeof existingFiles)[number]> = []
        let skippedUnchanged = 0

        for (const url of discoveredUrls) {
          const existing = existingFileMap.get(url.loc)
          if (!existing) {
            toFetch.push(url)
          } else {
            const existingMetadata = existing.metadata as Metadata
            const isFailed =
              existing.status === 'indexing_failed' ||
              existing.status === 'upload_failed' ||
              existing.status === 'upload_pending'
            const tagsChanged = !this.fileTagsMatch(existing, tags)
            if (isFailed || (url.lastmod && existingMetadata?.lastmod !== url.lastmod)) {
              toFetch.push(url)
            } else if (tagsChanged) {
              toUpdateTags.push(existing)
            } else {
              skippedUnchanged++
              console.log(`Skipping unchanged page: ${url.loc}`)
            }
          }
        }

        console.log(
          `To fetch: ${toFetch.length}, To update tags: ${toUpdateTags.length}, To remove: ${toRemove.length}, Skipped (unchanged): ${skippedUnchanged}${input.force ? ' [FORCE MODE]' : ''}`
        )

        const deleted = await step.map(
          'deleting removed urls',
          toRemove,
          (f) =>
            client
              .deleteFile({ id: f.id })
              .catch(() => null)
              .then(
                () =>
                  ({
                    file: f.id,
                    name: f.key,
                    hash: (f.metadata as Metadata)?.hash || '',
                    size: f.size ?? -1,
                  }) satisfies Item
              ),
          { concurrency: 5 }
        )

        const tagUpdated = await step.map(
          'updating changed tags',
          toUpdateTags,
          async (f) => {
            try {
              await client.updateFileMetadata({ id: f.id, tags: this.fileTagsPatch(f, tags) })
              return {
                file: f.id,
                name: f.key,
                hash: (f.metadata as Metadata)?.hash || '',
                size: f.size ?? -1,
              } satisfies Item
            } catch {
              console.warn(`Failed to update tags for file ${f.id}, will retry on next sync`)
              return null
            }
          },
          { concurrency: 5 }
        )

        const fetchErrorsByUrl = new Map<string, string>()
        const fetchAndIndex = async (sitemapUrl: SitemapUrl): Promise<Item | null> => {
          try {
            const {
              url,
              contentType: fetchedContentType,
              content,
              metadata: fetchMetadata,
            } = await this.fetchPageContent(sitemapUrl.loc)
            const hash = crypto.createHash('sha256').update(content).digest('hex')

            let contentType = fetchedContentType
            if (!contentType) {
              contentType = content.includes('<html') ? 'text/html' : 'text/markdown'
            }

            const key = `data_source://${this.type}/${this.id}/${encodeURIComponent(url)}`

            const uploaded = await client.uploadFile({
              key,
              content,
              contentType,
              accessPolicies: [],
              tags,
              index: true,
              indexing: {
                configuration: {
                  vision: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                    indexPages: true as any,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                    transcribePages: true as any,
                  },
                  summarization: { enable: false },
                },
              },
              metadata: {
                [WellKnownMetadata.knowledge.URL]: url,
                hash,
                ...(sitemapUrl.lastmod && { lastmod: sitemapUrl.lastmod }),
                ...(contentType && { contentType }),
                ...((fetchMetadata?.[WellKnownMetadata.knowledge.TITLE] || sitemapUrl.title) && {
                  [WellKnownMetadata.knowledge.TITLE]:
                    fetchMetadata?.[WellKnownMetadata.knowledge.TITLE] ?? sitemapUrl.title,
                }),
                ...(fetchMetadata?.[WellKnownMetadata.knowledge.DESCRIPTION] && {
                  [WellKnownMetadata.knowledge.DESCRIPTION]: fetchMetadata[WellKnownMetadata.knowledge.DESCRIPTION],
                }),
                ...(fetchMetadata?.[WellKnownMetadata.knowledge.FAVICON] && {
                  [WellKnownMetadata.knowledge.FAVICON]: fetchMetadata[WellKnownMetadata.knowledge.FAVICON],
                }),
                dsId: this.id,
                dsType: this.type,
              } satisfies Metadata,
            })

            return { file: uploaded.file.id, hash, name: key, size: uploaded.file.size ?? -1 }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`Failed to fetch and index ${sitemapUrl.loc}: ${message}`)
            fetchErrorsByUrl.set(sitemapUrl.loc, message)
            return null
          }
        }

        const indexed = await step.map(
          'fetching and indexing pages',
          toFetch.slice(0, this.maxPages),
          (url) => fetchAndIndex(url),
          { concurrency: 20, maxAttempts: 2 }
        )

        const successful = indexed.filter((f) => f !== null)
        const fetchErrors = groupUrlErrors(fetchErrorsByUrl, 'Page fetch failed')

        // Register this web page source in dsData state for dashboard visibility.
        // Fresh read right before write to minimize the race window with concurrent KB workflows.
        await step('register web page source', async () => {
          try {
            const botId = context.get('botId')
            const getStateResult = await client._inner
              .getState({ id: botId, type: 'bot', name: 'dsData' })
              .catch(() => ({ state: null }))
            const freshState = getStateResult.state
            const existingPayload = freshState?.payload || {}
            const kbPayload = existingPayload[input.kbId] || {}
            const websiteUrl = this.baseUrl || this.sitemapUrl || this.urls?.[0] || ''
            const getTitle = (): string => {
              if (!websiteUrl) return 'Website'
              try {
                const urlWithProtocol = websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`
                return new URL(urlWithProtocol).hostname
              } catch {
                return websiteUrl
              }
            }
            kbPayload[this.id] = {
              type: 'web-page',
              title: getTitle(),
              createdOn: kbPayload[this.id]?.createdOn || Date.now(),
              data: { websiteUrl, pages: [], indexingJobs: [] },
            }
            existingPayload[input.kbId] = kbPayload
            await client._inner.setState({ id: botId, type: 'bot', name: 'dsData', payload: existingPayload })
            console.log(`Registered web page source "${this.id}" in dsData for KB ${input.kbId}`)
          } catch (err) {
            console.warn('Failed to register web page source in dsData state:', err)
          }
        })

        console.log(
          `[SYNC DEBUG] ✅ WebsiteSource sync complete for "${this.id}". Processed: ${discoveredUrls.length}, Added: ${successful.length}, Deleted: ${deleted.length}`
        )

        return {
          processed: discoveredUrls.length,
          deleted,
          added: successful,
          updated: tagUpdated.filter((f): f is Item => f !== null),
          errors: [...discoveryErrors, ...fetchErrors],
        }
      },
    })
  }

  /**
   * Sync this website source directly without workflows.
   * Used by the CLI (KnowledgeManager) to sync website sources locally.
   *
   * Supports all four modes (`urls`, `sitemap`, `llms-txt`, `website`). Both
   * `node:fetch` and `integration:browser` work — for `integration:browser`,
   * page fetches route through `client.callAction('browser:browsePages')`,
   * and `mode === 'website'` URL discovery routes through
   * `client.callAction('browser:discoverUrls')`. Sitemap files themselves are
   * always fetched via plain HTTP (the headless browser renders XML as HTML).
   */
  public async syncDirect(
    client: Client,
    botId: string,
    input: z.infer<typeof SyncInput>
  ): Promise<z.infer<typeof SyncOutput>> {
    const crypto = await import('crypto')

    console.log(
      `Starting local sync for WebsiteSource [${this.id}] in mode [${this.mode}, maxPages=${this.maxPages}, maxDepth=${this.maxDepth}]`
    )
    console.log(`Using knowledge base: ${input.kbName}, force reindex: ${!!input.force}, ${input.dsId}`)
    if (input.force) {
      console.log('🔄 FORCE MODE: Re-indexing all files regardless of changes')
    }

    const scopeTags = this.baseFileTags(input)
    const tags = this.fileTags(input)

    const { urls: discoveredUrls, errors: discoveryErrors } = await this.discoverUrlsDirect(client)

    console.log(`Discovered ${discoveredUrls.length} URLs`)
    console.log(`Will process up to ${this.maxPages} pages`)

    const existingFiles = await client.list.files({ tags: scopeTags }).collect()

    if (input.force && existingFiles.length > 0) {
      console.warn(
        `⚠️  Website source configuration changed - deleting ${existingFiles.length} existing files and recrawling`
      )
      const limit = pLimit(5)
      await Promise.all(existingFiles.map((f) => limit(() => client.deleteFile({ id: f.id }).catch(() => null))))
      console.log(`✅ Deleted ${existingFiles.length} files, starting fresh crawl`)
    }

    const existingFileMap = input.force
      ? new Map<string, (typeof existingFiles)[number]>()
      : new Map(existingFiles.map((f) => [(f.metadata as Metadata)?.[WellKnownMetadata.knowledge.URL], f]))

    const toRemove = input.force
      ? []
      : existingFiles.filter(
          (f) => !discoveredUrls.find((u) => u.loc === (f.metadata as Metadata)?.[WellKnownMetadata.knowledge.URL])
        )

    const toFetch: SitemapUrl[] = []
    const toUpdateTags: Array<(typeof existingFiles)[number]> = []
    let skippedUnchanged = 0

    for (const url of discoveredUrls) {
      const existing = existingFileMap.get(url.loc)
      if (!existing) {
        toFetch.push(url)
      } else {
        const existingMetadata = existing.metadata as Metadata
        const isFailed =
          existing.status === 'indexing_failed' ||
          existing.status === 'upload_failed' ||
          existing.status === 'upload_pending'
        const tagsChanged = !this.fileTagsMatch(existing, tags)
        if (isFailed || (url.lastmod && existingMetadata?.lastmod !== url.lastmod)) {
          toFetch.push(url)
        } else if (tagsChanged) {
          toUpdateTags.push(existing)
        } else {
          skippedUnchanged++
          console.log(`Skipping unchanged page: ${url.loc}`)
        }
      }
    }

    console.log(
      `To fetch: ${toFetch.length}, To update tags: ${toUpdateTags.length}, To remove: ${toRemove.length}, Skipped (unchanged): ${skippedUnchanged}${input.force ? ' [FORCE MODE]' : ''}`
    )

    const deleteLimit = pLimit(5)
    const deleted: Item[] = []
    await Promise.all(
      toRemove.map((f) =>
        deleteLimit(async () => {
          try {
            await client.deleteFile({ id: f.id })
            deleted.push({
              file: f.id,
              name: f.key,
              hash: (f.metadata as Metadata)?.hash || '',
              size: f.size ?? -1,
            })
          } catch {
            console.warn(`Failed to delete file ${f.id}, will retry on next sync`)
          }
        })
      )
    )

    console.log(`Deleted ${deleted.length} URLs, starting fetch phase...`)

    const tagUpdateLimit = pLimit(5)
    const updated: Item[] = []
    await Promise.all(
      toUpdateTags.map((f) =>
        tagUpdateLimit(async () => {
          try {
            await client.updateFileMetadata({ id: f.id, tags: this.fileTagsPatch(f, tags) })
            updated.push({
              file: f.id,
              name: f.key,
              hash: (f.metadata as Metadata)?.hash || '',
              size: f.size ?? -1,
            })
          } catch {
            console.warn(`Failed to update tags for file ${f.id}, will retry on next sync`)
          }
        })
      )
    )

    const fetchLimit = pLimit(20)
    const maxAttempts = 2
    const fetchErrorsByUrl = new Map<string, string>()

    const fetchAndIndex = async (sitemapUrl: SitemapUrl): Promise<Item | null> => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const {
            url,
            contentType: fetchedContentType,
            content,
            metadata: fetchMetadata,
          } = await this.fetchPageContent(sitemapUrl.loc, client)
          const hash = crypto.createHash('sha256').update(content).digest('hex')

          let contentType = fetchedContentType
          if (!contentType) {
            contentType = content.includes('<html') ? 'text/html' : 'text/markdown'
          }

          const key = `data_source://${this.type}/${this.id}/${encodeURIComponent(url)}`

          const uploaded = await client.uploadFile({
            key,
            content,
            contentType,
            accessPolicies: [],
            tags,
            index: true,
            indexing: {
              configuration: {
                vision: {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                  indexPages: true as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                  transcribePages: true as any,
                },
                summarization: { enable: false },
              },
            },
            metadata: {
              [WellKnownMetadata.knowledge.URL]: url,
              hash,
              ...(sitemapUrl.lastmod && { lastmod: sitemapUrl.lastmod }),
              ...(contentType && { contentType }),
              ...((fetchMetadata?.[WellKnownMetadata.knowledge.TITLE] || sitemapUrl.title) && {
                [WellKnownMetadata.knowledge.TITLE]:
                  fetchMetadata?.[WellKnownMetadata.knowledge.TITLE] ?? sitemapUrl.title,
              }),
              ...(fetchMetadata?.[WellKnownMetadata.knowledge.DESCRIPTION] && {
                [WellKnownMetadata.knowledge.DESCRIPTION]: fetchMetadata[WellKnownMetadata.knowledge.DESCRIPTION],
              }),
              ...(fetchMetadata?.[WellKnownMetadata.knowledge.FAVICON] && {
                [WellKnownMetadata.knowledge.FAVICON]: fetchMetadata[WellKnownMetadata.knowledge.FAVICON],
              }),
              dsId: this.id,
              dsType: this.type,
            } satisfies Metadata,
          })

          return { file: uploaded.file.id, hash, name: key, size: uploaded.file.size ?? -1 }
        } catch (err) {
          if (attempt < maxAttempts - 1) {
            const backoff = Math.min(100 * Math.pow(2, attempt), 5000)
            console.warn(`Fetch attempt ${attempt + 1} failed for ${sitemapUrl.loc}, retrying in ${backoff}ms...`)
            await new Promise((resolve) => setTimeout(resolve, backoff))
          } else {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`Failed to fetch and index ${sitemapUrl.loc} after ${maxAttempts} attempts: ${message}`)
            fetchErrorsByUrl.set(sitemapUrl.loc, message)
            return null
          }
        }
      }
      return null
    }

    console.log(`Fetching and indexing ${toFetch.length} pages...`)

    const indexed = await Promise.all(toFetch.map((url) => fetchLimit(() => fetchAndIndex(url))))
    const successful: Item[] = indexed.filter((f): f is Item => f !== null)
    const fetchErrors = groupUrlErrors(fetchErrorsByUrl, 'Page fetch failed')

    console.log(
      `Fetch complete. ${indexed.length} attempted, ${successful.length} successful, ${fetchErrorsByUrl.size} failed`
    )

    // Register this web page source in dsData state for dashboard visibility
    try {
      const getStateResult = await client
        .getState({ id: botId, type: 'bot', name: 'dsData' })
        .catch(() => ({ state: null }))
      const freshState = getStateResult.state
      const existingPayload = freshState?.payload || {}
      const kbPayload = existingPayload[input.kbId] || {}
      const websiteUrl = this.baseUrl || this.sitemapUrl || this.urls?.[0] || ''
      const getTitle = (): string => {
        if (!websiteUrl) return 'Website'
        try {
          const urlWithProtocol = websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`
          return new URL(urlWithProtocol).hostname
        } catch {
          return websiteUrl
        }
      }
      kbPayload[this.id] = {
        type: 'web-page',
        title: getTitle(),
        createdOn: kbPayload[this.id]?.createdOn || Date.now(),
        data: { websiteUrl, pages: [], indexingJobs: [] },
      }
      existingPayload[input.kbId] = kbPayload
      await client.setState({ id: botId, type: 'bot', name: 'dsData', payload: existingPayload })
      console.log(`Registered web page source "${this.id}" in dsData for KB ${input.kbId}`)
    } catch (err) {
      console.warn('Failed to register web page source in dsData state:', err)
    }

    console.log(
      `✅ WebsiteSource local sync complete for "${this.id}". Processed: ${discoveredUrls.length}, Added: ${successful.length}, Deleted: ${deleted.length}`
    )

    return {
      processed: discoveredUrls.length,
      deleted,
      added: successful,
      updated,
      errors: [...discoveryErrors, ...fetchErrors],
    }
  }

  // ---------------------------------------------------------------------------
  // Factories
  // ---------------------------------------------------------------------------

  static fromWebsite(baseUrl: string, options: WebsiteSourceOptions = {}): WebsiteSource {
    const id = options.id || `website_${baseUrl.replace(/https?:\/\//, '').replace(/\//g, '_')}`
    return new WebsiteSource(id, 'website', { ...options, baseUrl })
  }

  static fromSitemap(sitemapUrl: string, options: WebsiteSourceOptions = {}): WebsiteSource {
    const id = options.id || `sitemap_${sitemapUrl.replace(/https?:\/\//, '').replace(/\//g, '_')}`
    return new WebsiteSource(id, 'sitemap', { ...options, sitemapUrl })
  }

  static fromLlmsTxt(llmsTxtUrl: string, options: WebsiteSourceOptions = {}): WebsiteSource {
    const id = options.id || `llmstxt_${llmsTxtUrl.replace(/https?:\/\//, '').replace(/\//g, '_')}`
    return new WebsiteSource(id, 'llms-txt', { ...options, llmsTxtUrl })
  }

  static fromUrls(urls: string[], options: UrlsSourceOptions = {}): WebsiteSource {
    let defaultId = `urls_${urls.length}_pages`
    if (urls.length > 0) {
      try {
        const firstUrl = new URL(urls[0]!)
        const domain = firstUrl.hostname.replace(/^www\./, '').replace(/\./g, '_')
        const urlsHash = urls
          .slice()
          .sort()
          .join('|')
          .split('')
          .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
          .toString(16)
          .replace('-', '')
          .slice(0, 8)
        defaultId = `urls_${domain}_${urlsHash}`
      } catch {
        // Fall back to count-based ID if URL parsing fails
      }
    }
    const id = options.id || defaultId
    return new WebsiteSource(id, 'urls', { ...options, urls })
  }
}
