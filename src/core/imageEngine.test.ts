import { describe, expect, it } from 'vitest'
import { DEFAULT_ADJUSTMENTS, processPixels } from './imageEngine'

describe('image adjustments', () => {
  it('adjusts brightness without changing alpha', () => {
    const pixels = new Uint8ClampedArray([100, 100, 100, 255])
    processPixels(pixels, 1, 1, 'original', 0, { ...DEFAULT_ADJUSTMENTS, brightness: 0.5, sharpen: 0 })
    expect(pixels[0]).toBeGreaterThan(100)
    expect(pixels[3]).toBe(255)
  })

  it('uses the adjustable black and white threshold', () => {
    const darkThreshold = new Uint8ClampedArray([170, 170, 170, 255])
    const lightThreshold = new Uint8ClampedArray([170, 170, 170, 255])
    processPixels(darkThreshold, 1, 1, 'bw', 1, { ...DEFAULT_ADJUSTMENTS, threshold: 0.9, sharpen: 0 })
    processPixels(lightThreshold, 1, 1, 'bw', 1, { ...DEFAULT_ADJUSTMENTS, threshold: 0.1, sharpen: 0 })
    expect(darkThreshold[0]).toBe(0)
    expect(lightThreshold[0]).toBe(255)
  })

  it('normalizes a shaded paper background', () => {
    const pixels = new Uint8ClampedArray([92, 88, 84, 255])
    processPixels(pixels, 1, 1, 'whiteboard', 1, { ...DEFAULT_ADJUSTMENTS, sharpen: 0 })
    expect(pixels[0]).toBeGreaterThan(200)
    expect(pixels[1]).toBeGreaterThan(200)
  })
})
