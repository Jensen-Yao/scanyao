import { describe, expect, it } from 'vitest'
import { DEFAULT_ADJUSTMENTS } from './imageEngine'
import { copyPageSettings, fileStem, movePage } from './document'
import type { ScanPage } from '../types'

const page = (id: string): ScanPage => ({
  id,
  fileName: `${id}.jpg`,
  sourceUrl: `blob:${id}`,
  sourceFile: new File([], `${id}.jpg`, { type: 'image/jpeg' }),
  corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  rotation: 0,
  flipX: false,
  flipY: false,
  filter: 'clean',
  filterStrengths: { clean: 0.8 },
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  createdAt: 1,
})

describe('document helpers', () => {
  it('moves pages without mutating the source array', () => {
    const pages = [page('a'), page('b'), page('c')]
    const moved = movePage(pages, 'b', -1)
    expect(moved.map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(pages.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('copies edits while preserving the target source', () => {
    const source = { ...page('a'), rotation: 90, filterStrengths: { clean: 0.55, stamp: 0.9 }, adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 0.2 } }
    const target = page('b')
    const copied = copyPageSettings(source, target)
    expect(copied.fileName).toBe('b.jpg')
    expect(copied.rotation).toBe(0)
    expect(copied.filterStrengths.stamp).toBe(0.9)
    expect(copied.adjustments.brightness).toBe(0.2)
  })

  it('creates filesystem-safe document names', () => {
    expect(fileStem('合同:终版?.jpg')).toBe('合同-终版-')
  })
})
