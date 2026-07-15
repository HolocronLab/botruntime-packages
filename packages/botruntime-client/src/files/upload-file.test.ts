import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upload } from './upload-file'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

const fileResponse = (uploadUrl: string) => ({
  file: {
    id: 'fixture.pdf',
    key: 'fixture.pdf',
    contentType: 'application/pdf',
    uploadUrl,
  },
})

describe('uploadFile upload URL authentication', () => {
  beforeEach(() => {
    vi.mocked(axios.put).mockReset().mockResolvedValue({})
  })

  it('forwards client headers to a same-origin server-controlled upload URL', async () => {
    const client = {
      config: {
        apiUrl: 'https://botruntime.ru',
        headers: {
          Authorization: 'Bearer machine-token',
          'x-bot-id': '23',
          'x-workspace-id': '2',
        },
      },
      upsertFile: vi.fn().mockResolvedValue(
        fileResponse('https://botruntime.ru/v1/files/upload?key=fixture.pdf&token=upload-token')
      ),
    }

    await upload(client, {
      key: 'fixture.pdf',
      content: Buffer.from('pdf'),
      contentType: 'application/pdf',
      accessPolicies: [],
    })

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('https://botruntime.ru/v1/files/upload'),
      expect.any(Uint8Array),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer machine-token',
          'x-bot-id': '23',
          'x-workspace-id': '2',
          'Content-Type': 'application/pdf',
        }),
      })
    )
  })

  it('does not leak client credentials to an external presigned upload URL', async () => {
    const client = {
      config: {
        apiUrl: 'https://botruntime.ru',
        headers: { Authorization: 'Bearer machine-token', 'x-bot-id': '23' },
      },
      upsertFile: vi.fn().mockResolvedValue(fileResponse('https://storage.example/upload-token')),
    }

    await upload(client, {
      key: 'fixture.pdf',
      content: Buffer.from('pdf'),
      contentType: 'application/pdf',
      accessPolicies: [],
    })

    const headers = vi.mocked(axios.put).mock.calls[0]![2]!.headers as Record<string, string>
    expect(headers).toEqual({ 'Content-Type': 'application/pdf' })
  })
})
