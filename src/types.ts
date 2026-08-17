import type { CornerSet } from './core/geometry'
import type { FilterId } from './core/imageEngine'

export interface ScanPage {
  id: string
  fileName: string
  sourceUrl: string
  sourceFile: File
  corners: CornerSet
  rotation: number
  filter: FilterId
  strength: number
  createdAt: number
}
