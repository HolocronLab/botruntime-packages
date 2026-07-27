import { z } from '../zui'

export const FILE_REF_ADMISSION_METADATA_KEY = 'botruntimeFileRef'

export type FileRefAdmissionMode = 'exact' | 'resolve-current'

export type ResolveCurrentFileRefInputV1 = Readonly<{
  id: string
}>

export type ExactFileRefSelectorV1 = Readonly<{
  id: string
  generation: string
}>

export type PreparedFileRefV1 = Readonly<{
  version: '1'
  id: string
  generation: string
  checksum: `sha256:${string}`
  size: number
  contentType?: string
  filename?: string
}>

const annotation = (mode: FileRefAdmissionMode) => ({
  [FILE_REF_ADMISSION_METADATA_KEY]: {
    version: 'v1',
    mode,
  },
})

/**
 * Declares a caller-facing FileRef selector in an integration action schema.
 *
 * The CLI lifts this private ZUI marker to the normative
 * `x-botruntime-fileRef` JSON Schema extension. CloudAPI replaces the selector
 * with an authoritative PreparedFileRefV1 before invoking a durable handler.
 */
export function operationFileRef(mode: 'resolve-current'): z.ZodObject<{
  id: z.ZodString
}>
export function operationFileRef(mode: 'exact'): z.ZodObject<{
  id: z.ZodString
  generation: z.ZodString
}>
export function operationFileRef(mode: FileRefAdmissionMode): z.AnyZodObject {
  if (mode === 'exact') {
    return z.object({
      id: z.string().min(1).max(1024),
      generation: z.string().min(1).max(1024),
    }).strict().metadata(annotation(mode))
  }
  return z.object({
    id: z.string().min(1).max(1024),
  }).strict().metadata(annotation(mode))
}
