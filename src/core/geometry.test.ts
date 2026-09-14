import { describe, expect, it } from 'vitest'
import {
  calculateWarpSize,
  dragQuadEdge,
  pointInQuad,
  projectUnitPoint,
  quadEdgeMidpoint,
  quadrilateralArea,
  translateQuad,
  type CornerSet,
} from './geometry'

const square: CornerSet = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

describe('document geometry', () => {
  it('maps the output square back into the selected quadrilateral', () => {
    expect(projectUnitPoint(square, 0.25, 0.75)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('keeps the output under the requested dimension', () => {
    expect(calculateWarpSize(square, 1200, 1800, 900)).toEqual({ width: 600, height: 900 })
  })

  it('calculates normalized quadrilateral area', () => {
    expect(quadrilateralArea(square)).toBe(1)
  })

  it('detects points inside and outside the quadrilateral', () => {
    expect(pointInQuad(square, { x: 0.5, y: 0.5 })).toBe(true)
    expect(pointInQuad(square, { x: 1.5, y: 0.5 })).toBe(false)
    const skewed: CornerSet = [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ]
    expect(pointInQuad(skewed, { x: 0.5, y: 0.5 })).toBe(true)
    expect(pointInQuad(skewed, { x: 0.02, y: 0.02 })).toBe(false)
  })

  it('translates the whole quad and clamps to the image bounds', () => {
    const small: CornerSet = [
      { x: 0.2, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.7, y: 0.7 },
      { x: 0.2, y: 0.7 },
    ]
    const moved = translateQuad(small, 0.25, 0.1)
    expect(moved[0].x).toBeCloseTo(0.45)
    expect(moved[0].y).toBeCloseTo(0.3)
    expect(moved[2].x).toBeCloseTo(0.95)
    expect(moved[2].y).toBeCloseTo(0.8)
    const clamped = translateQuad(small, 0.5, 0.5)
    expect(clamped[2]).toEqual({ x: 1, y: 1 })
    expect(translateQuad(small, 0, 0)).toBe(small)
  })

  it('drags an edge by moving both of its corners', () => {
    const dragged = dragQuadEdge(square, 0, { x: 0.5, y: 0.3 })
    expect(dragged[0]).toEqual({ x: 0, y: 0.3 })
    expect(dragged[1]).toEqual({ x: 1, y: 0.3 })
    expect(dragged[2]).toEqual({ x: 1, y: 1 })
  })

  it('returns edge midpoints', () => {
    expect(quadEdgeMidpoint(square, 0)).toEqual({ x: 0.5, y: 0 })
    expect(quadEdgeMidpoint(square, 1)).toEqual({ x: 1, y: 0.5 })
  })
})
