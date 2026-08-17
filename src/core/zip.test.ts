import { describe, expect, it } from 'vitest'
import { createZip } from './zip'

describe('ZIP export', () => {
  it('creates a stored ZIP with UTF-8 filenames', () => {
    const bytes = createZip([{ name: '扫描-01.jpg', data: new Uint8Array([1, 2, 3]) }])
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(new TextDecoder().decode(bytes)).toContain('扫描-01.jpg')
    expect(Array.from(bytes.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06])
  })
})
