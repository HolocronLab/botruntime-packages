/**
 * HTML fetching and metadata extraction utilities
 */

export type HtmlMetadata = {
  title?: string
  description?: string
  favicon?: string
}

export type FetchHtmlResult = {
  url: string
  contentType: string
  content: string
  metadata?: HtmlMetadata
}

/**
 * Extract metadata from HTML content using regex patterns
 *
 * @param html - The HTML content to parse
 * @returns Extracted metadata including title, description, and favicon
 */
export function extractHtmlMetadata(html: string): HtmlMetadata {
  const metadata: HtmlMetadata = {}

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch && titleMatch[1]) {
    metadata.title = titleMatch[1].trim()
  }

  // Extract meta description - try both standard and Open Graph
  // Try double quotes first
  let descriptionMatch = html.match(
    /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content="([^"]+)"/i
  )

  // If not found, try single quotes
  if (!descriptionMatch) {
    descriptionMatch = html.match(
      /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content='([^']+)'/i
    )
  }

  if (descriptionMatch && descriptionMatch[1]) {
    metadata.description = descriptionMatch[1].trim()
  }

  // Extract favicon - try multiple patterns with both quote styles
  const faviconPatterns = [
    // rel first, double quotes
    /<link\s+[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*href="([^"]+)"/i,
    // rel first, single quotes
    /<link\s+[^>]*rel='(?:icon|shortcut icon|apple-touch-icon)'[^>]*href='([^']+)'/i,
    // href first, double quotes
    /<link\s+[^>]*href="([^"]+)"[^>]*rel="(?:icon|shortcut icon|apple-touch-icon)"/i,
    // href first, single quotes
    /<link\s+[^>]*href='([^']+)'[^>]*rel='(?:icon|shortcut icon|apple-touch-icon)'/i,
  ]

  for (const pattern of faviconPatterns) {
    const faviconMatch = html.match(pattern)
    if (faviconMatch && faviconMatch[1]) {
      metadata.favicon = faviconMatch[1].trim()
      break
    }
  }

  // If no explicit favicon found, default to /favicon.ico
  if (!metadata.favicon) {
    metadata.favicon = '/favicon.ico'
  }

  return metadata
}

/**
 * Resolve a potentially relative URL to an absolute URL
 *
 * @param url - The URL to resolve (may be relative)
 * @param baseUrl - The base URL to resolve against
 * @returns The absolute URL, or the original URL if resolution fails
 */
export function resolveUrl(url: string, baseUrl: string): string {
  // If already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  try {
    const base = new URL(baseUrl)
    return new URL(url, base.origin).href
  } catch {
    // If URL parsing fails, return original
    return url
  }
}

/**
 * Fetch content from a URL and extract metadata if HTML
 *
 * This function safely handles both HTML and non-HTML content (XML, JSON, text, etc.).
 * Metadata extraction only occurs for HTML content types. For other content types
 * (like sitemap.xml, robots.txt, RSS feeds), it returns the raw content without
 * attempting metadata extraction.
 *
 * @param url - The URL to fetch
 * @param options - Optional fetch options
 * @returns Fetch result with content and extracted metadata (HTML only)
 *
 * @example
 * // Fetching HTML - extracts metadata
 * const html = await fetchHtml('https://example.com')
 * console.log(html.metadata?.title) // "Example Domain"
 *
 * @example
 * // Fetching XML - no metadata extraction
 * const xml = await fetchHtml('https://example.com/sitemap.xml')
 * console.log(xml.content) // Raw XML content
 * console.log(xml.metadata) // undefined
 */
export async function fetchHtml(
  url: string,
  options?: {
    userAgent?: string
    timeout?: number
  }
): Promise<FetchHtmlResult> {
  const userAgent = options?.userAgent || 'Mozilla/5.0 (compatible; BotpressBot/1.0)'

  const fetchOptions: RequestInit = {
    headers: {
      'User-Agent': userAgent,
    },
  }

  // Only add signal if timeout is specified
  if (options?.timeout) {
    fetchOptions.signal = AbortSignal.timeout(options.timeout)
  }

  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') || 'text/html'
  const content = await response.text()

  // Only extract metadata for HTML content
  const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml')

  if (!isHtml) {
    return {
      url,
      contentType,
      content,
    }
  }

  const extracted = extractHtmlMetadata(content)

  // Resolve relative favicon URLs to absolute
  if (extracted.favicon) {
    extracted.favicon = resolveUrl(extracted.favicon, url)
  }

  return {
    url,
    contentType,
    content,
    metadata: extracted,
  }
}
