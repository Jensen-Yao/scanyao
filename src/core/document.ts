import type { ScanPage } from '../types'

export function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'scan'
}

export function movePage(pages: ScanPage[], pageId: string, offset: -1 | 1) {
  const index = pages.findIndex((page) => page.id === pageId)
  const target = index + offset
  if (index < 0 || target < 0 || target >= pages.length) return pages
  const next = [...pages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function copyPageSettings(source: ScanPage, target: ScanPage): ScanPage {
  return {
    ...target,
    filter: source.filter,
    filterStrengths: { ...source.filterStrengths },
    adjustments: { ...source.adjustments },
  }
}
