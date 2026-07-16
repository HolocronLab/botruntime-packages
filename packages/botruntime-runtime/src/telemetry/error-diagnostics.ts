export const ERROR_NAME_LIMIT_BYTES = 128
export const ERROR_CODE_LIMIT_BYTES = 128
export const ERROR_MESSAGE_LIMIT_BYTES = 8_192
export const ERROR_STACK_LIMIT_BYTES = 32_768

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function boundedErrorString(value: unknown, maxBytes: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value)
  if (!text) return undefined

  const encoded = encoder.encode(text)
  if (encoded.byteLength <= maxBytes) return text

  let end = maxBytes
  while (end > 0) {
    const nextByte = encoded[end]
    if (nextByte === undefined || (nextByte & 0xc0) !== 0x80) break
    end--
  }
  const bounded = decoder.decode(encoded.subarray(0, end))
  return bounded || undefined
}
