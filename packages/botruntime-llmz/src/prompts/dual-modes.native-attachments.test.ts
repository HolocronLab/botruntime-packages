import { describe, expect, it } from 'vitest'

import { TranscriptArray } from '../transcript.js'
import { DualModePrompt } from './dual-modes.js'

describe('DualModePrompt native attachments', () => {
  it('maps a PDF transcript attachment to the existing multipart URL and MIME contract', async () => {
    const transcript = new TranscriptArray([
      {
        role: 'user',
        content: '{"type":"file"}',
        attachments: [
          {
            type: 'file',
            url: 'https://files.example/contract.pdf',
            mimeType: 'application/pdf',
            title: 'contract.pdf',
          },
        ],
      },
    ])

    const message = await DualModePrompt.getInitialUserMessage({
      transcript,
      instructions: undefined,
      objects: [],
      globalTools: [],
      exits: [],
      components: [],
    })

    expect(message).toMatchObject({
      role: 'user',
      type: 'multipart',
      content: [
        { type: 'text' },
        { type: 'text', text: "Here's the attachment [A] (contract.pdf)" },
        {
          type: 'image',
          url: 'https://files.example/contract.pdf',
          mimeType: 'application/pdf',
        },
      ],
    })
  })
})
