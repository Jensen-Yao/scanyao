import { describe, expect, it } from 'vitest'
import { createPdf } from './pdf'

describe('PDF export', () => {
  it('creates a valid multi-page PDF envelope', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const bytes = createPdf([
      { bytes: jpeg, width: 1200, height: 1800 },
      { bytes: jpeg, width: 1800, height: 1200 },
    ])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 2')
    expect(text).toContain('xref')
    expect(text.endsWith('%%EOF')).toBe(true)
  })
})
