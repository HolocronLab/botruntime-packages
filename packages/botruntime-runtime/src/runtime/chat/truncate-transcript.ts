import { TranscriptItem } from './transcript'
import { truncateObject } from './truncate-object'

export function truncateTranscript(
  transcript: TranscriptItem[],
  options: { maxSize: number; maxSizePerItem?: number }
): TranscriptItem[] {
  const { maxSize, maxSizePerItem } = options

  const result: TranscriptItem[] = []
  let totalSize = 0

  // Process items from the end (most recent first)
  for (let i = transcript.length - 1; i >= 0; i--) {
    const item = transcript[i]!
    const itemSize = getItemSize(item)

    // Calculate effective size with per-item limit
    const effectiveSize = maxSizePerItem ? Math.min(itemSize, maxSizePerItem) : itemSize

    // Check if we can fit this item
    if (totalSize + effectiveSize > maxSize) {
      break
    }

    // Truncate item content if needed
    let processedItem = item
    if (maxSizePerItem && itemSize > maxSizePerItem) {
      if ('content' in item && item.content) {
        processedItem = {
          ...item,
          content: item.content.slice(0, maxSizePerItem),
        } as TranscriptItem
      } else if (item.role === 'event' && item.payload) {
        const truncated = truncateObject(item.payload, maxSizePerItem)
        processedItem = {
          ...item,
          payload: truncated.result,
        }
      }
    }

    result.unshift(processedItem)
    totalSize += effectiveSize
  }

  return result
}

function getItemSize(item: TranscriptItem): number {
  if ('content' in item && item.content) {
    return item.content.length
  }
  if (item.role === 'event' && item.payload) {
    return JSON.stringify(item.payload).length
  }
  return 0
}
