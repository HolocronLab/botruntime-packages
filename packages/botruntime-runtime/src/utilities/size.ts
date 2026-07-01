import { limitConfigs } from '@holocronlab/botruntime-const'
import sizeof from 'object-sizeof'
import bytes from 'bytes'
import prettyBytes from 'pretty-bytes'

export const MaxStateSize = {
  ...limitConfigs.state_item_payload_bytes,
  get bytes() {
    if (this.unit === 'bytes') {
      return this.value
    }
    return bytes.parse(this.value + this.unit)!
  },
  get human() {
    return prettyBytes(this.bytes)
  },
} as const

export const isStateTooBig = (state: unknown): false | { human: string; bytes: number } => {
  if (state === null || state === undefined) {
    return false
  }

  const stateSize = sizeof(state)
  return stateSize > MaxStateSize.bytes ? { human: prettyBytes(stateSize), bytes: stateSize } : false
}

const previewCutoffBytes = 1024

export const getObjectPreview = (obj: unknown, depth: number = 2): unknown => {
  try {
    if (sizeof(obj) > previewCutoffBytes && depth === 0) {
      return {
        $size: prettyBytes(sizeof(obj)),
        $type: typeof obj,
      }
    }

    if (typeof obj === 'object' && !Array.isArray(obj) && !Buffer.isBuffer(obj) && Object.keys(obj as {}).length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spreading unknown object
      const temp = { ...(obj as any) }
      for (const key in temp) {
        temp[key] = getObjectPreview(temp[key], depth - 1)
      }
      return temp
    }

    if (Array.isArray(obj) && (obj as []).length) {
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapping unknown array
      return (obj as any[]).map((x) => getObjectPreview(x, depth - 1))
    }

    if (sizeof(obj) > previewCutoffBytes) {
      return `(${prettyBytes(sizeof(obj))}) [${typeof obj}] ...`
    }

    return obj
  } catch {
    return ''
  }
}
