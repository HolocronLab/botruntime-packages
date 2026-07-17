// instrument-all-http.ts (Node 18+)
/* eslint-disable @typescript-eslint/no-explicit-any -- HTTP instrumentation requires patching untyped internals (http/https modules, undici dispatcher) */
import http from 'node:http'
import https from 'node:https'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import { context as otelContext, SpanStatusCode } from '@opentelemetry/api'

import { Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici'

// Import typed span creation
import { tracer, isSilentTracing } from './tracing'
import { setSpanAttributeWithPayload } from './trace-payloads'
import { propagationHeadersForSpan, shouldPropagateTraceContext } from './trace-propagation'

function hasHeader(headers: Record<string, unknown>, name: string): boolean {
  const lower = name.toLowerCase()
  return Object.keys(headers).some((key) => key.toLowerCase() === lower)
}

// Helper to determine if a URL is a Botpress API call
function isBotpressUrl(fullUrl: string): boolean {
  try {
    const url = new URL(fullUrl)
    const host = url.hostname

    return (
      host.includes('botruntime.ru') ||
      // still instrument the upstream cognitive API host (cognitive-v2 wire) until it is fully in-house
      host.includes('api.botpress.cloud') ||
      host.includes('api.botpress.dev')
    )
  } catch {
    return false
  }
}

// Helper to extract IDs from URL and body
function extractIds(fullUrl: string, body?: any) {
  const ids: {
    conversationId?: string
    messageId?: string
    workflowId?: string
    userId?: string
    eventId?: string
  } = {}

  // Extract from URL
  const conversationMatch = fullUrl.match(/\/conversations\/([^/?]+)/)
  const messageMatch = fullUrl.match(/\/messages\/([^/?]+)/)
  const workflowMatch = fullUrl.match(/\/workflows\/([^/?]+)/)
  const userMatch = fullUrl.match(/\/users\/([^/?]+)/)
  const eventMatch = fullUrl.match(/\/events\/([^/?]+)/)

  if (conversationMatch?.[1]) ids.conversationId = conversationMatch[1]
  if (messageMatch?.[1]) ids.messageId = messageMatch[1]
  if (workflowMatch?.[1]) ids.workflowId = workflowMatch[1]
  if (userMatch?.[1]) ids.userId = userMatch[1]
  if (eventMatch?.[1]) ids.eventId = eventMatch[1]

  // Extract from body (if available)
  if (body && typeof body === 'object') {
    if (body.conversationId && !ids.conversationId) ids.conversationId = body.conversationId
    if (body.messageId && !ids.messageId) ids.messageId = body.messageId
    if (body.workflowId && !ids.workflowId) ids.workflowId = body.workflowId
    if (body.userId && !ids.userId) ids.userId = body.userId
    if (body.eventId && !ids.eventId) ids.eventId = body.eventId
  }

  return ids
}

// Helper to decompress response body based on content-encoding
function decompressBody(buffer: Buffer, contentEncoding?: string): string {
  if (!contentEncoding) {
    return buffer.toString('utf-8')
  }

  const encoding = contentEncoding.toLowerCase().trim()

  try {
    switch (encoding) {
      case 'gzip':
      case 'x-gzip':
        return gunzipSync(buffer).toString('utf-8')
      case 'deflate':
        return inflateSync(buffer).toString('utf-8')
      case 'br':
        return brotliDecompressSync(buffer).toString('utf-8')
      case 'identity':
      case '':
        return buffer.toString('utf-8')
      default:
        // Unknown encoding - return as-is
        return buffer.toString('utf-8')
    }
  } catch (error) {
    // If decompression fails, return raw buffer as utf-8
    // (might be corrupted data or wrong encoding detection)
    console.warn(`Failed to decompress response with encoding "${encoding}":`, error)
    return buffer.toString('utf-8')
  }
}

export function installHttpClientInstrumentation({ injectTraceHeader = true }: { injectTraceHeader?: boolean } = {}) {
  const restores: Array<() => void> = []

  // ---------- helpers ----------
  // Marker header to prevent double instrumentation
  const INSTRUMENTED_HEADER = 'x-adk-instrumented'

  // ---------- http/https (covers native http/https requests) ----------
  {
    const orig = {
      httpRequest: http.request,
      httpGet: http.get,
      httpsRequest: https.request,
      httpsGet: https.get,
    }

    function wrapRequest<T extends typeof http.request | typeof https.request>(requestFn: T): T {
      return function wrapped(this: any, ...args: any[]) {
        let options: any, cb: any
        let urlString: string

        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          urlString = args[0].toString()
          options = args[1] && typeof args[1] === 'object' ? { ...args[1] } : {}
          cb = args.find((a) => typeof a === 'function')
        } else {
          options = { ...args[0] }
          // Build URL from options - handle various option formats
          if (options.href) {
            urlString = options.href
          } else if (options.hostname || options.host) {
            const protocol = options.protocol || 'https:'
            const host = options.hostname || options.host || ''
            const port = options.port ? `:${options.port}` : ''
            const path = options.path || '/'
            urlString = `${protocol}//${host}${port}${path}`
          } else {
            // Fallback for incomplete options
            urlString = options.path || '/'
          }
          cb = args.find((a: any) => typeof a === 'function')
        }

        // Check if already instrumented
        options.headers ||= {}
        if (options.headers[INSTRUMENTED_HEADER]) {
          return requestFn.apply(this, args as any)
        }

        // Skip tracing entirely when in silent mode
        if (isSilentTracing()) {
          return requestFn.apply(this, args as any)
        }

        // Mark as instrumented
        options.headers[INSTRUMENTED_HEADER] = 'true'

        const method = (options.method || 'GET').toUpperCase()
        const isBotpress = isBotpressUrl(urlString)

        // Parse body if available
        let bodyData: any = null
        if (options.body) {
          try {
            bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body
          } catch {
            // Ignore
          }
        }

        // Extract IDs from URL and body
        const ids = extractIds(urlString, bodyData)

        // Extract action name for callAction requests
        let actionName: string | undefined
        if (method === 'POST' && urlString.includes('/v1/chat/actions') && bodyData?.type) {
          actionName = bodyData.type
        }

        // Detect workflow status checks (GET /workflows/{id}) - mark as low importance debug traces
        const isWorkflowStatusCheck = method === 'GET' && /\/workflows\/[^/?]+$/.test(urlString)

        // Create span attributes
        const spanName = isBotpress ? 'botpress.client' : 'http.client'
        const spanAttributes = isBotpress
          ? {
              'botpress.method': method,
              'botpress.url': urlString,
              'botpress.via': 'http',
              importance: isWorkflowStatusCheck ? 'low' : 'medium',
              ...(isWorkflowStatusCheck && { 'debug.type': 'workflow-status-check' }),
              ...ids,
              ...(actionName && { 'action.name': actionName }),
            }
          : {
              'http.method': method,
              'http.url': urlString,
              'http.via': 'http',
              importance: 'medium',
            }

        // Start the span with the current active context as parent
        const span = tracer.startSpan(
          spanName,
          {
            attributes: spanAttributes,
          },
          otelContext.active()
        )

        if (shouldPropagateTraceContext(injectTraceHeader, isBotpress)) {
          for (const [name, value] of Object.entries(propagationHeadersForSpan(span))) {
            if (!hasHeader(options.headers, name)) options.headers[name] = value
          }
        }

        let req
        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          req = requestFn.call(this, args[0], options, cb)
        } else {
          req = requestFn.call(this, options, cb)
        }

        // Track request body
        const requestBodyChunks: Buffer[] = []
        const origWrite = req.write.bind(req)
        const origEnd = req.end.bind(req)

        req.write = function (chunk: any, ...args: any[]) {
          if (chunk) {
            requestBodyChunks.push(Buffer.from(chunk))
          }
          return origWrite(chunk, ...args)
        }

        req.end = function (chunk?: any, ...args: any[]) {
          if (chunk) {
            requestBodyChunks.push(Buffer.from(chunk))
          }

          // Set request body attribute
          if (requestBodyChunks.length > 0) {
            const bodyString = Buffer.concat(requestBodyChunks).toString('utf-8')
            setSpanAttributeWithPayload(span, isBotpress ? 'botpress.request.body' : 'http.request.body', bodyString)
          }

          return origEnd(chunk, ...args)
        }

        req.on('response', (res: http.IncomingMessage) => {
          span.setAttribute(isBotpress ? 'botpress.status_code' : 'http.status_code', res.statusCode || 0)

          // Track response body
          const responseBodyChunks: Buffer[] = []
          const contentEncoding = res.headers['content-encoding']

          res.on('data', (chunk: Buffer) => {
            responseBodyChunks.push(chunk)
          })

          res.on('end', () => {
            // Set response body attribute
            if (responseBodyChunks.length > 0) {
              const bodyBuffer = Buffer.concat(responseBodyChunks)
              const bodyString = decompressBody(bodyBuffer, contentEncoding)
              setSpanAttributeWithPayload(
                span,
                isBotpress ? 'botpress.response.body' : 'http.response.body',
                bodyString
              )
            }

            if ((res.statusCode || 0) >= 400) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${res.statusCode}`,
              })
            }
            // Don't set OK status - leave it as UNSET (0) for successful requests
            span.end()
          })
        })

        req.on('error', (err: Error) => {
          span.setAttribute(isBotpress ? 'botpress.error' : 'http.error', err.message)
          span.recordException(err)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          })
          span.end()
        })

        return req
      } as T
    }

    ;(http as any).request = wrapRequest(orig.httpRequest)
    ;(https as any).request = wrapRequest(orig.httpsRequest)
    ;(http as any).get = function wrappedGet(...a: any[]) {
      const r = (http as any).request(...a)
      r.end()
      return r
    }
    ;(https as any).get = function wrappedGet(...a: any[]) {
      const r = (https as any).request(...a)
      r.end()
      return r
    }

    restores.push(() => {
      http.request = orig.httpRequest
      http.get = orig.httpGet
      https.request = orig.httpsRequest
      https.get = orig.httpsGet
    })
  }

  // ---------- undici global dispatcher (covers axios and other undici-based clients) ----------
  {
    const inner = getGlobalDispatcher()
    class Instrumented extends Dispatcher {
      constructor(private readonly d: Dispatcher) {
        super()
      }
      dispatch(opts: Dispatcher.RequestOptions, handler: Dispatcher.DispatchHandler) {
        // Check if already instrumented by looking for the marker header
        const optsHeaders = opts.headers
        if (optsHeaders) {
          if (Array.isArray(optsHeaders)) {
            // Headers as array: ["key", "value", "key2", "value2", ...]
            for (let i = 0; i < optsHeaders.length; i += 2) {
              if (String(optsHeaders[i]).toLowerCase() === INSTRUMENTED_HEADER) {
                return this.d.dispatch(opts, handler)
              }
            }
          } else if (typeof optsHeaders === 'object') {
            // Headers as object
            if ((optsHeaders as any)[INSTRUMENTED_HEADER]) {
              return this.d.dispatch(opts, handler)
            }
          }
        }

        // Skip tracing entirely when in silent mode
        if (isSilentTracing()) {
          return this.d.dispatch(opts, handler)
        }

        const method = (opts.method || 'GET').toUpperCase()
        const origin = String(opts.origin ?? '')
        const path = String(opts.path ?? '')
        const fullUrl = `${origin}${path}`
        const isBotpress = isBotpressUrl(fullUrl)

        // Parse request body
        let bodyData: any = null
        if (opts.body) {
          try {
            const bodyStr = typeof opts.body === 'string' ? opts.body : ''
            bodyData = bodyStr ? JSON.parse(bodyStr) : null
          } catch {
            // Ignore parse errors
          }
        }

        // Extract IDs from URL and body
        const ids = extractIds(fullUrl, bodyData)

        // Extract action name for callAction requests
        let actionName: string | undefined
        if (method === 'POST' && path === '/v1/chat/actions' && bodyData?.type) {
          actionName = bodyData.type
        }

        // Detect workflow status checks (GET /workflows/{id}) - mark as low importance debug traces
        const isWorkflowStatusCheck = method === 'GET' && /\/workflows\/[^/?]+$/.test(fullUrl)

        // Create span attributes
        const spanName = isBotpress ? 'botpress.client' : 'http.client'
        const spanAttributes = isBotpress
          ? {
              'botpress.method': method,
              'botpress.url': path,
              'botpress.via': 'undici',
              importance: isWorkflowStatusCheck ? 'low' : 'medium',
              ...(isWorkflowStatusCheck && { 'debug.type': 'workflow-status-check' }),
              ...ids,
              ...(actionName && { 'action.name': actionName }),
            }
          : {
              'http.method': method,
              'http.url': fullUrl,
              'http.via': 'undici',
              importance: 'medium',
            }

        // Start the span with the current active context as parent
        const span = tracer.startSpan(
          spanName,
          {
            attributes: spanAttributes,
          },
          otelContext.active()
        )

        // Track request body
        if (opts.body) {
          let requestBody = ''
          if (typeof opts.body === 'string') {
            requestBody = opts.body
          } else if (Buffer.isBuffer(opts.body)) {
            requestBody = opts.body.toString('utf-8')
          } else if (opts.body && typeof opts.body === 'object' && 'toString' in opts.body) {
            try {
              requestBody = opts.body.toString()
            } catch {
              // Ignore
            }
          }

          if (requestBody) {
            setSpanAttributeWithPayload(span, isBotpress ? 'botpress.request.body' : 'http.request.body', requestBody)
          }
        }

        // header injection
        const headers: Array<string | Buffer> = []
        if (Array.isArray(opts.headers)) {
          headers.push(...(opts.headers as any))
        } else if (opts.headers && typeof opts.headers === 'object') {
          for (const [k, v] of Object.entries(opts.headers as Record<string, any>)) headers.push(k, String(v))
        }

        // Add instrumentation marker
        headers.push(INSTRUMENTED_HEADER, 'true')

        if (shouldPropagateTraceContext(injectTraceHeader, isBotpress)) {
          for (const [name, value] of Object.entries(propagationHeadersForSpan(span))) {
            let present = false
            for (let i = 0; i < headers.length; i += 2) {
              if (String(headers[i]).toLowerCase() === name.toLowerCase()) {
                present = true
                break
              }
            }
            if (!present) headers.push(name, value)
          }
        }
        const nextOpts = { ...opts, headers }

        // Track response body
        const responseBodyChunks: Buffer[] = []
        let contentEncoding: string | undefined

        const wrap = {
          onConnect: handler.onConnect?.bind(handler),
          onUpgrade: handler.onUpgrade?.bind(handler),
          onHeaders: (statusCode: number, rawHeaders: string[], resume: () => void) => {
            // Set status code attribute
            span.setAttribute(isBotpress ? 'botpress.status_code' : 'http.status_code', statusCode)

            // Extract content-encoding from raw headers
            // rawHeaders format: ["header1", "value1", "header2", "value2", ...]
            // Values can be strings or Buffers depending on undici version
            for (let i = 0; i < rawHeaders.length; i += 2) {
              if (String(rawHeaders[i]).toLowerCase() === 'content-encoding') {
                contentEncoding = String(rawHeaders[i + 1])
                break
              }
            }

            // Set span status
            if (statusCode >= 500) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${statusCode}`,
              })
            } else if (statusCode >= 400) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${statusCode}`,
              })
            }
            // Don't set OK status - leave it as UNSET (0) for successful requests

            // Don't end span here - wait for onComplete to capture response body

            // @ts-expect-error - Undici deprecated signature, but we need to maintain compatibility
            handler.onHeaders?.(statusCode, rawHeaders, resume)
          },
          onError: (err: Error) => {
            // Set error attribute
            span.setAttribute(isBotpress ? 'botpress.error' : 'http.error', err.message)
            span.recordException(err)
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            })
            span.end()

            // @ts-expect-error - Undici deprecated signature, but we need to maintain compatibility
            handler.onError(err)
          },
          onBodySent: handler.onBodySent?.bind(handler),
          onData: (chunk: Buffer) => {
            // Capture response body chunks
            responseBodyChunks.push(chunk)

            handler.onData?.(chunk)
          },
          onComplete: (trailers: string[]) => {
            // Set response body attribute
            if (responseBodyChunks.length > 0) {
              const bodyBuffer = Buffer.concat(responseBodyChunks)
              const bodyString = decompressBody(bodyBuffer, contentEncoding)
              setSpanAttributeWithPayload(
                span,
                isBotpress ? 'botpress.response.body' : 'http.response.body',
                bodyString
              )
            }

            // End span after capturing response body
            span.end()

            handler.onComplete?.(trailers)
          },
          // @ts-expect-error - Undici deprecated signature, but we need to maintain compatibility
          onPush: handler.onPush?.bind(handler),
        } as any as Dispatcher.DispatchHandler

        // @ts-expect-error - Dispatcher type mismatch due to our wrapper
        return this.d.dispatch(nextOpts, wrap)
      }
      close(...a: any[]) {
        return (this.d as any).close?.(...a)
      }
      destroy(...a: any[]) {
        return (this.d as any).destroy?.(...a)
      }
    }
    const inst = new Instrumented(inner)
    setGlobalDispatcher(inst)
    restores.push(() => {
      setGlobalDispatcher(inner)
    })
  }

  // ---------- return restore ----------
  return function restoreAll() {
    for (const r of restores.reverse()) r()
  }
}
