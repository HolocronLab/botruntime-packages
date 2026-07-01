import { z } from '@holocronlab/botruntime-sdk'

export const TrackedStateSchema = z.object({
  value: z.any(),
  location: z.discriminatedUnion('type', [
    z.object({ type: z.literal('state') }),
    z.object({ type: z.literal('file'), key: z.string() }),
  ]),
})
