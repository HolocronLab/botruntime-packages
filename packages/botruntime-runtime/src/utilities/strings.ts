import stringify from 'fast-safe-stringify'

/**
 * Inspect any JSON-serializable value so its JSON string fits within maxBytes (UTF-8).
 * - Long strings are middle-truncated: "hello ... world"
 * - Arrays keep the first few elements and append a tail note: "... (+N more items)"
 * - Large/recursive subtrees collapse to "[...]"
 * - Cycles: "[Circular]"
 * - Always returns *valid JSON* when JSON.stringify()'d
 */
export function inspectToJsonSize(
  input: unknown,
  opts: {
    maxBytes: number // hard cap in UTF-8 bytes
    minAssumedBytes?: number // default 1000 — used to reserve slack for "[...]" markers, not a return minimum
    initialStringHead?: number // default 120
    initialStringTail?: number // default 60
    initialArrayItems?: number // default 5
    initialObjectKeys?: number // default Infinity (no key cap initially)
    maxDepth?: number // default 20
  }
): string {
  const {
    maxBytes,
    minAssumedBytes = 1000,
    initialStringHead = 120,
    initialStringTail = 60,
    initialArrayItems = 5,
    initialObjectKeys = Number.POSITIVE_INFINITY,
    maxDepth = 20,
  } = opts

  // Always leave a small overhead for markers at the end of tightening cycles
  const OVERHEAD = Math.max(160, Math.floor(minAssumedBytes / 6))

  // Utility: UTF-8 byte length
  const utf8Len = (s: string): number => {
    let bytes = 0
    for (let i = 0; i < s.length; i++) {
      const codePoint = s.charCodeAt(i)
      if (codePoint < 0x80) bytes += 1
      else if (codePoint < 0x800) bytes += 2
      else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
        // surrogate pair
        i++
        bytes += 4
      } else bytes += 3
    }
    return bytes
  }

  // Middle-truncate a string to head/tail with an ellipsis marker
  const elideString = (s: string, head: number, tail: number): string => {
    if (s.length <= head + tail + 5) return s
    const start = s.slice(0, Math.max(0, head)).trimEnd()
    const end = s.slice(Math.max(0, s.length - tail)).trimStart()
    return `${start} [...] ${end}`
  }

  // Collapse marker for big/unknown blobs
  const COLLAPSE = '[...]'
  const CIRCULAR = '[Circular]'

  type Limits = {
    head: number
    tail: number
    arr: number
    objKeys: number
    depth: number
  }

  // Create a summarized clone with current limits
  const summarize = (value: unknown, seen: WeakSet<object>, limits: Limits): unknown => {
    if (limits.depth < 0) return COLLAPSE

    // Primitives
    if (value === null) return null
    const t = typeof value
    if (t === 'boolean' || t === 'number') return value
    if (t === 'string') return elideString(value as string, limits.head, limits.tail)
    if (t === 'bigint') return elideString(String(value), limits.head, limits.tail)
    if (t === 'symbol' || t === 'function' || t === 'undefined') {
      // JSON.stringify would drop these (or stringify undefined in arrays as null)
      return null
    }

    // Objects
    if (typeof value === 'object' && value) {
      if (seen.has(value as object)) return CIRCULAR
      seen.add(value as object)

      // Typed arrays / buffers
      if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        const len = (value as unknown as ArrayLike<unknown>).length ?? 0
        seen.delete(value as object)
        return `<${(value as object & { constructor?: { name?: string } }).constructor?.name || 'TypedArray'} len=${len}>`
      }

      // Date
      if (value instanceof Date) {
        seen.delete(value as object)
        return (value as Date).toISOString()
      }

      // Array
      if (Array.isArray(value)) {
        const out: unknown[] = []
        const n = value.length
        const maxKeep = Math.max(0, limits.arr)
        const nextLimits: Limits = {
          head: limits.head,
          tail: limits.tail,
          arr: Math.max(0, Math.floor(limits.arr * 0.9)), // slightly stricter as we go deeper
          objKeys: Math.max(1, Math.floor(limits.objKeys)),
          depth: limits.depth - 1,
        }
        const upto = Math.min(n, maxKeep)
        for (let i = 0; i < upto; i++) {
          out.push(summarize(value[i], seen, nextLimits))
        }
        if (n > upto) {
          out.push(`... (+${n - upto} more items)`)
        }
        seen.delete(value as object)
        return out
      }

      // Plain object
      const isPlain = Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
      if (!isPlain) {
        // For unknown classes, collapse to a lightweight tag + summarized own props
        const tag = (value as object & { constructor?: { name?: string } }).constructor?.name ?? 'Object'
        const props: Record<string, unknown> = {}
        const keys = Object.keys(value as Record<string, unknown>)
        const keep = Math.min(keys.length, Math.max(1, limits.objKeys))
        const nextLimits: Limits = {
          head: limits.head,
          tail: limits.tail,
          arr: Math.max(0, Math.floor(limits.arr * 0.9)),
          objKeys: Math.max(1, Math.floor(limits.objKeys * 0.9)),
          depth: limits.depth - 1,
        }
        for (let i = 0; i < keep; i++) {
          const k = keys[i]!
          props[k] = summarize((value as Record<string, unknown>)[k], seen, nextLimits)
        }
        if (keys.length > keep) props['__truncated__'] = `+${keys.length - keep} keys`
        seen.delete(value as object)
        return { [`<${tag}>`]: props }
      }

      // Truly plain object
      {
        const keys = Object.keys(value as Record<string, unknown>)
        const keep = Math.min(keys.length, Math.max(1, limits.objKeys))
        const nextLimits: Limits = {
          head: limits.head,
          tail: limits.tail,
          arr: Math.max(0, Math.floor(limits.arr * 0.9)),
          objKeys: Math.max(1, Math.floor(limits.objKeys * 0.9)),
          depth: limits.depth - 1,
        }

        // Optional heuristic: keep smaller stringifiable fields first
        keys.sort() // deterministic
        const keptKeys = keys.slice(0, keep)

        const out: Record<string, unknown> = {}
        for (const k of keptKeys) {
          out[k] = summarize((value as Record<string, unknown>)[k], seen, nextLimits)
        }
        if (keys.length > keep) {
          out['__truncated__'] = `+${keys.length - keep} keys`
        }
        seen.delete(value as object)
        return out
      }
    }

    return null
  }

  // Tightening schedule
  let limits: Limits = {
    head: initialStringHead,
    tail: initialStringTail,
    arr: initialArrayItems,
    objKeys: initialObjectKeys,
    depth: maxDepth,
  }

  // Defensive lower bounds so we don't go crazy
  const MIN_HEAD = 8
  const MIN_TAIL = 8
  const MIN_ARR = 1
  const MIN_KEYS = 1

  // Loop: summarize → JSON → check bytes → tighten if needed
  for (let i = 0; i < 30; i++) {
    const seen = new WeakSet<object>()
    const summarized = summarize(input, seen, limits)
    let json: string
    try {
      json = stringify(summarized, undefined, 2)
    } catch {
      // As a last resort, stringify a collapse marker
      json = stringify(COLLAPSE, undefined, 2)
    }

    const size = utf8Len(json)
    if (size <= Math.max(OVERHEAD, maxBytes)) {
      // If we undershot too much and still have *tonnes* of space, we could relax once.
      // But: we keep it simple; the contract is to fit under maxBytes, not to fill it.
      return json
    }

    // Tighten progressively:
    // 1) Strings shorter
    // 2) Fewer array items
    // 3) Fewer object keys
    // 4) Reduce depth
    // 5) Nuclear: collapse everything
    limits = {
      head: Math.max(MIN_HEAD, Math.floor(limits.head * 0.7)),
      tail: Math.max(MIN_TAIL, Math.floor(limits.tail * 0.7)),
      arr: Math.max(MIN_ARR, Math.floor(limits.arr * 0.75)),
      objKeys: Math.max(MIN_KEYS, Math.floor(limits.objKeys * 0.75)),
      depth: Math.max(0, limits.depth - 1),
    }

    // If we've hit rock-bottom limits and still too big, collapse to "[...]"
    if (
      limits.head === MIN_HEAD &&
      limits.tail === MIN_TAIL &&
      limits.arr === MIN_ARR &&
      limits.objKeys === MIN_KEYS &&
      limits.depth === 0
    ) {
      return stringify(COLLAPSE, undefined, 2)
    }
  }

  // Safety net
  return stringify(COLLAPSE, undefined, 2)
}
