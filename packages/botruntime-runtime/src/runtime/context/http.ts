import {
  BOT_ID_HEADER,
  BOT_USER_ID_HEADER,
  CONFIGURATION_PAYLOAD_HEADER,
  CONFIGURATION_TYPE_HEADER,
  OPERATION_SUBTYPE_HEADER,
  OPERATION_TYPE_HEADER,
  WEBHOOK_ID_HEADER,
} from '../../consts'

export type RawHttpRequest = {
  body?: string
  query?: string
  headers?: Record<string, string>
  method: string
  path?: string
}

export type HttpRequest = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP body can be any type
  body: any
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  bot: {
    id: string
    userId: string
    tags: Record<string, string>
    configurationType: string
    configuration: {
      id: string
      createdAt: string
      updatedAt: string
      type: 'bot'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- configuration payload is dynamic
      payload: any
    }
  }
  // https://github.com/botpress/skynet/blob/587e3908a89c7391330e783fe19aa368161b2771/packages/bridge/src/adapters/sdk-clients/bot-client.ts#L30C63-L30C79
  operation: 'register' | 'event_received' | 'ping' | 'action_triggered'
  type: 'register' | 'message_created' | 'workflow_update' | 'state_expired' | 'actionTriggered' | (string & {})
  webhookId?: string
  raw: {
    body: string
    query: string
    headers: Record<string, string>
    method: string
  }
}

const decodeBase64Obj = (str: string): Record<string, string> => {
  if (typeof str === 'object' && str !== null && !Array.isArray(str)) {
    return str as Record<string, string>
  }

  if (typeof str !== 'string' || !str.trim()) {
    return {}
  }

  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    return {}
  }
}

const parseJson = (input: unknown) => {
  if (typeof input !== 'string') {
    return input
  }

  try {
    return JSON.parse(input)
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    const p = Number((errorMessage.match(/position (\d+)/) ?? [])[1] ?? 0)
    console.error('Length:', Buffer.byteLength(input), 'bytes')
    console.error('Around error:', input.slice(Math.max(0, p - 250), p + 250))
    console.error(`\nAROUND
>>>>>>>>>>>>>>>>>>
${input.slice(Math.max(0, p - 100, 100))}
<<<<<<<<<<<<<<<<<<<
${input.slice(Math.max(p, 100))}
================\n`)
    console.error(`Beginning:
================
${input.slice(0, 250)}
================`)
    console.error(`End:
================
${input.slice(0, -250)}
================`)

    return input
  }
}

export function parseHttpRequest(req: RawHttpRequest): HttpRequest {
  const getHeader = (name: string): string | undefined => {
    if (!req.headers) {
      return undefined
    }

    const headerKey = Object.keys(req.headers).find((key) => key.toLowerCase().trim() === name.toLowerCase().trim())

    return headerKey ? req.headers[headerKey] : undefined
  }

  const operation = getHeader(OPERATION_TYPE_HEADER) as HttpRequest['operation']
  const botId = getHeader(BOT_ID_HEADER) || 'unknown'
  const botUserId = getHeader(BOT_USER_ID_HEADER) || ''
  const webhookId = getHeader(WEBHOOK_ID_HEADER) || ''
  const type = getHeader(OPERATION_SUBTYPE_HEADER) as HttpRequest['type']
  const configurationType = getHeader(CONFIGURATION_TYPE_HEADER) || ''
  let tagsHeader = getHeader('x-bp-tags')
  let config = getHeader(CONFIGURATION_PAYLOAD_HEADER)

  const contentType = getHeader('content-type') || 'application/json'

  let body = req.body
  let path = req.path || '/'
  let query: Record<string, string> = {}
  let headers: Record<string, string> = { ...req.headers }

  if (req.query && typeof req.query === 'string') {
    const searchParams = new URLSearchParams(req.query)
    for (const [key, value] of searchParams) {
      query[key] = value
    }
  }

  let method = req.method.toUpperCase().trim() as HttpRequest['method']

  if (contentType.includes('application/json')) {
    body = parseJson(body)
  }

  let configuration = decodeBase64Obj(config || '') as HttpRequest['bot']['configuration']

  if (configuration && typeof configuration === 'object' && 'payload' in configuration) {
    configuration.payload = parseJson(configuration.payload)
  }

  let bot = {
    id: botId,
    userId: botUserId,
    tags: decodeBase64Obj(tagsHeader || ''),
    configurationType,
    configuration,
  }

  return {
    body: parseJson(body) ?? {},
    headers,
    path,
    query,
    method,
    operation,
    type,
    bot,
    webhookId,
    raw: {
      body: req.body || '',
      query: req.query || '',
      headers: req.headers || {},
      method: req.method,
    },
  }
}
