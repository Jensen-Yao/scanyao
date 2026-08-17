import { describe, expect, it } from 'vitest'
import { calculateCompositionLayout, calculateFreeformCanvasSize } from './compositor'

describe('image composition layout', () => {
  const sources = [{ width: 100, height: 200 }, { width: 200, height: 100 }]

  it('stacks pages vertically with a shared width', () => {
    const layout = calculateCompositionLayout(sources, 'vertical', 10)
    expect(layout.width).toBe(220)
    expect(layout.height).toBe(530)
    expect(layout.placements[0]).toMatchObject({ x: 10, y: 10, width: 200, height: 400 })
  })

  it('creates a two-column grid and caps oversized canvases', () => {
    const layout = calculateCompositionLayout(sources, 'grid', 10, 200)
    expect(Math.max(layout.width, layout.height)).toBe(200)
    expect(layout.placements).toHaveLength(2)
  })

  it('fits freeform portrait and landscape canvases inside the export cap', () => {
    expect(calculateFreeformCanvasSize(2, 2000)).toEqual({ width: 2000, height: 1000 })
    expect(calculateFreeformCanvasSize(0.5, 2000)).toEqual({ width: 1000, height: 2000 })
  })
})
