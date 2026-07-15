import { describe, expect, it } from 'vitest'
import { buildAttachmentPayload, fixtureReportLabel } from './attachments'

describe('eval attachment turns', () => {
  it('sends text and resolved fixtures through one ordinary bloc message', () => {
    expect(
      buildAttachmentPayload('Отправляю ДДУ', [
        {
          fixture: 'ddu-valid-direct',
          name: 'ДДУ.pdf',
          contentType: 'application/pdf',
          url: 'https://signed.example/private?token=secret',
          size: 128,
          sha256: 'a'.repeat(64),
        },
        {
          fixture: 'scan-1',
          name: 'scan.jpg',
          contentType: 'image/jpeg',
          url: 'https://signed.example/image?token=secret',
          size: 64,
          sha256: 'b'.repeat(64),
        },
      ])
    ).toEqual({
      type: 'bloc',
      items: [
        { type: 'text', text: 'Отправляю ДДУ' },
        {
          type: 'file',
          fileUrl: 'https://signed.example/private?token=secret',
          title: 'ДДУ.pdf',
        },
        {
          type: 'image',
          imageUrl: 'https://signed.example/image?token=secret',
        },
      ],
    })
  })

  it('keeps signed URLs and contents out of privacy-safe labels', () => {
    const label = fixtureReportLabel('Отправляю ДДУ', [
      {
        fixture: 'ddu-valid-direct',
        name: 'ДДУ.pdf',
        contentType: 'application/pdf',
        url: 'https://signed.example/private?token=secret',
        size: 128,
        sha256: 'a'.repeat(64),
      },
    ])

    expect(label).toContain('ddu-valid-direct')
    expect(label).toContain('application/pdf')
    expect(label).toContain('128')
    expect(label).toContain('sha256:' + 'a'.repeat(64))
    expect(label).not.toContain('signed.example')
    expect(label).not.toContain('secret')
  })
})
