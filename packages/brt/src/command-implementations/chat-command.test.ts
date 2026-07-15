import { describe, expect, it } from 'vitest'
import { chatApiUrlFor } from './chat-command'

describe('brt chat endpoint', () => {
  it('uses the generic integration ingress on the selected cloudapi', () => {
    expect(chatApiUrlFor('https://api.botruntime.ru/', undefined, 'wh_1')).toBe(
      'https://api.botruntime.ru/hooks/wh_1',
    )
  })

  it('honors an explicit chat base URL', () => {
    expect(
      chatApiUrlFor('https://ignored', 'http://localhost:8080/custom/', 'wh_1'),
    ).toBe('http://localhost:8080/custom/wh_1')
  })
})
