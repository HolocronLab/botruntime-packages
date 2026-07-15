import type { Message } from '@holocronlab/botruntime-chat'

export interface EvalAttachment {
  fixture: string
  name?: string
  contentType?: string
}

export interface ResolvedEvalFixture {
  fixture: string
  name: string
  contentType: string
  url: string
  size: number
  sha256: string
}

type ChatPayload = Message['payload']
type BlocItem = Extract<ChatPayload, { type: 'bloc' }>['items'][number]

function fixturePayload(fixture: ResolvedEvalFixture): BlocItem {
  if (fixture.contentType.startsWith('image/')) {
    return { type: 'image', imageUrl: fixture.url }
  }
  return { type: 'file', fileUrl: fixture.url, title: fixture.name }
}

export function buildAttachmentPayload(
  message: string | undefined,
  fixtures: ResolvedEvalFixture[]
): ChatPayload {
  const items: BlocItem[] = [
    ...(message ? [{ type: 'text' as const, text: message }] : []),
    ...fixtures.map(fixturePayload),
  ]
  if (items.length === 1) return items[0]!
  return { type: 'bloc', items }
}

/** Privacy-safe turn label. Signed URLs and file contents must never cross the reporting boundary. */
export function fixtureReportLabel(
  message: string | undefined,
  fixtures: ResolvedEvalFixture[]
): string {
  const metadata = fixtures.map(
    ({ fixture, contentType, size, sha256 }) =>
      `[fixture=${fixture} mime=${contentType} size=${size} sha256:${sha256}]`
  )
  return [message, ...metadata].filter(Boolean).join(' ')
}
