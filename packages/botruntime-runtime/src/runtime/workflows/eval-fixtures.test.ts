import { describe, expect, it, vi } from 'vitest'
import { createHostedFixtureResolver } from './eval-fixtures'

describe('hosted eval fixtures', () => {
  it('mints a fresh URL from the bot file store and validates immutable metadata', async () => {
    const getFile = vi.fn().mockResolvedValue({
      file: {
        id: 'file_1',
        url: 'https://signed.example/file?token=secret',
        size: 42,
        contentType: 'application/pdf',
        metadata: { sha256: 'a'.repeat(64) },
        status: 'upload_completed',
      },
    })
    const resolve = createHostedFixtureResolver(
      { 'ddu-valid': { fileId: 'file_1', name: 'D.pdf', contentType: 'application/pdf', size: 42, sha256: 'a'.repeat(64) } },
      { getFile }
    )

    await expect(resolve('ddu-valid')).resolves.toEqual({
      fixture: 'ddu-valid',
      name: 'D.pdf',
      contentType: 'application/pdf',
      size: 42,
      sha256: 'a'.repeat(64),
      url: 'https://signed.example/file?token=secret',
    })
    expect(getFile).toHaveBeenCalledWith({ id: 'file_1' })
  })

  it('fails closed for undeclared, incomplete, or mutated files', async () => {
    const getFile = vi.fn().mockResolvedValue({
      file: {
        id: 'file_1',
        url: 'https://signed.example/file',
        size: 41,
        contentType: 'application/pdf',
        metadata: { sha256: 'b'.repeat(64) },
        status: 'upload_completed',
      },
    })
    const resolve = createHostedFixtureResolver(
      { 'ddu-valid': { fileId: 'file_1', name: 'D.pdf', contentType: 'application/pdf', size: 42, sha256: 'a'.repeat(64) } },
      { getFile }
    )

    await expect(resolve('missing')).rejects.toThrow(/not declared/i)
    await expect(resolve('ddu-valid')).rejects.toThrow(/metadata mismatch/i)
  })
})
