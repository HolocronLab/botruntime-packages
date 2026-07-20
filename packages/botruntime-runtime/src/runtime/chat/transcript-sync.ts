export type TranscriptCursor = {
  messageId?: string
  createdAt?: string
}

type CursorMessage = {
  id: string
  createdAt: string
}

/**
 * Messages are supplied in Cloud list order (newest first). Prefer the stable
 * message identity so equal provider timestamps cannot skip a turn. The
 * timestamp fallback migrates transcript states written by older runtimes.
 */
export function messagesAfterTranscriptCursor<T extends CursorMessage>(
  messagesNewestFirst: T[],
  cursor: TranscriptCursor | undefined
): T[] {
  if (!cursor) return messagesNewestFirst

  if (cursor.messageId) {
    const cursorIndex = messagesNewestFirst.findIndex((message) => message.id === cursor.messageId)
    if (cursorIndex >= 0) return messagesNewestFirst.slice(0, cursorIndex)

    // The cursor fell outside the bounded Cloud page. Re-consume the page and
    // let transcript ID de-duplication handle overlap; a timestamp fallback
    // could skip a distinct message sharing the cursor timestamp.
    return messagesNewestFirst
  }

  if (!cursor.createdAt) return messagesNewestFirst
  const since = new Date(cursor.createdAt).getTime()
  if (!Number.isFinite(since)) return messagesNewestFirst

  return messagesNewestFirst.filter((message) => new Date(message.createdAt).getTime() > since)
}

export function advanceTranscriptCursor(
  _current: TranscriptCursor | undefined,
  message: CursorMessage
): TranscriptCursor {
  // Cloud list order is the source of truth (keyset by message ID). Provider
  // timestamps may move backwards for imported or relayed messages and are
  // retained only for migration from the legacy timestamp-only watermark.
  return { messageId: message.id, createdAt: message.createdAt }
}
