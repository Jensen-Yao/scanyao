import type { CornerSet } from './core/geometry'
import type { FilterId, ScanAdjustments } from './core/imageEngine'

export interface ScanPage {
  id: string
  fileName: string
  sourceUrl: string
  sourceFile: File
  corners: CornerSet
  rotation: number
  flipX: boolean
  flipY: boolean
  filter: FilterId
  filterStrengths: Partial<Record<FilterId, number>>
  adjustments: ScanAdjustments
  createdAt: number
}

export interface ScanDocument {
  title: string
  pages: ScanPage[]
  selectedId: string | null
}

export type ExportQuality = 'compact' | 'balanced' | 'best'
export type PdfPageSize = 'auto' | 'a4' | 'letter'
export type MergeLayout = 'vertical' | 'horizontal' | 'grid'

export interface ExportOptions {
  quality: ExportQuality
  pageSize: PdfPageSize
  margin: boolean
  mergeLayout: MergeLayout
}
