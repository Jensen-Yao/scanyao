import { describe, expect, it } from 'vitest'
import { calculateWarpSize, projectUnitPoint, quadrilateralArea, type CornerSet } from './geometry'

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
})
