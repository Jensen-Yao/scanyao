import type { ScanPage } from '../types'
import { DEFAULT_FILTER_STRENGTHS, type FilterId } from './imageEngine'

export function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'scan'
}

export function filterStrengthFor(page: Pick<ScanPage, 'filter' | 'filterStrengths'>, filter: FilterId = page.filter) {
  return page.filterStrengths?.[filter] ?? DEFAULT_FILTER_STRENGTHS[filter]
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
