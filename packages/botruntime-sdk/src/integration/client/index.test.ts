import type * as client from '@holocronlab/botruntime-client'
import { describe, expect, test, vi } from 'vitest'
import type { BaseIntegration } from '../common'
import { IntegrationSpecificClient } from '.'

describe('IntegrationSpecificClient exact FileRef streaming', () => {
  test('delegates without reading or replacing the raw stream', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const fileRef: client.ExactFileRef = {
      id: 'file-1',
      size: 0,
      checksum: 'a'.repeat(64),
    }
    const downloadFileRef = vi.fn().mockResolvedValue({ fileRef, stream })
    const sdk = new IntegrationSpecificClient<BaseIntegration>({
      downloadFileRef,
    } as unknown as client.Client)

    await expect(sdk.downloadFileRef({ fileRef })).resolves.toEqual({ fileRef, stream })
    expect(downloadFileRef).toHaveBeenCalledWith({ fileRef })
  })
})
