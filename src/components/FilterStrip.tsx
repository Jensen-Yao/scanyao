import { useEffect, useRef, useState } from 'preact/hooks'
import {
  Aperture, Archive, Check, FileBadge, FileImage, FileText, Grid2X2, ImagePlus, Layers3,
  Monitor, Moon, Newspaper, NotebookPen, ScanLine, ScanText, ScrollText, Sparkles, Sun, WandSparkles,
} from 'lucide-preact'
import type { ScanPage } from '../types'
import { filterStrengthFor } from '../core/document'
import { renderScan, type FilterId } from '../core/imageEngine'

export type FilterCategoryId = 'recommended' | 'documents' | 'receipts' | 'scenes'

export const FILTER_CATEGORIES: { id: FilterCategoryId; label: string }[] = [
  { id: 'recommended', label: '推荐' },
  { id: 'documents', label: '文档' },
  { id: 'receipts', label: '票证' },
  { id: 'scenes', label: '场景' },
]

export const FILTERS: { id: FilterId; label: string; icon: typeof FileText; hint: string; category: FilterCategoryId }[] = [
  { id: 'auto', label: '自动', icon: WandSparkles, hint: '根据纸张与色彩自动优化', category: 'recommended' },
  { id: 'clean', label: '文档', icon: FileText, hint: '提亮纸张并拉开层次', category: 'recommended' },
  { id: 'enhance', label: '增强', icon: Sparkles, hint: '提升对比', category: 'recommended' },
  { id: 'color', label: '彩色', icon: ImagePlus, hint: '增强彩色文字与印章', category: 'recommended' },
  { id: 'text', label: '文字', icon: ScanText, hint: '强化黑色印刷文字', category: 'documents' },
  { id: 'shadow', label: '去阴影', icon: Moon, hint: '均衡纸张局部光照', category: 'documents' },
  { id: 'book', label: '书页', icon: Layers3, hint: '减轻书脊与页边阴影', category: 'documents' },
  { id: 'newspaper', label: '报纸', icon: Newspaper, hint: '去黄并强化密集小字', category: 'documents' },
  { id: 'notes', label: '手写', icon: NotebookPen, hint: '保留蓝黑笔迹并提亮纸张', category: 'documents' },
  { id: 'bw', label: '黑白', icon: FileText, hint: '纯黑白文档', category: 'documents' },
  { id: 'receipt', label: '票据', icon: Archive, hint: '强化小字与浅色底纹', category: 'receipts' },
  { id: 'invoice', label: '发票', icon: ScrollText, hint: '保留彩色章并强化票面文字', category: 'receipts' },
  { id: 'card', label: '名片', icon: Grid2X2, hint: '强化小字并保留品牌色', category: 'receipts' },
  { id: 'id', label: '证件', icon: FileBadge, hint: '温和保留人像与证件底色', category: 'receipts' },
  { id: 'certificate', label: '证书', icon: FileBadge, hint: '保留底纹、照片与印章', category: 'receipts' },
  { id: 'stamp', label: '印章', icon: Check, hint: '突出红蓝印章与签字', category: 'receipts' },
  { id: 'photo', label: '照片', icon: Aperture, hint: '轻度改善照片色彩', category: 'scenes' },
  { id: 'whiteboard', label: '白板', icon: Sun, hint: '提亮白板并保留彩色笔迹', category: 'scenes' },
  { id: 'blueprint', label: '蓝图', icon: ScanLine, hint: '强化工程图线条', category: 'scenes' },
  { id: 'screen', label: '屏幕', icon: Monitor, hint: '轻度平滑屏摄摩尔纹', category: 'scenes' },
  { id: 'grayscale', label: '灰度', icon: ScanLine, hint: '低饱和灰阶', category: 'scenes' },
  { id: 'original', label: '原图', icon: FileImage, hint: '保留原色', category: 'scenes' },
]

interface FilterStripProps {
  page: ScanPage
  activeFilter: FilterId
  onSelect: (filter: FilterId) => void
}

function pageHash(page: ScanPage) {
  const corners = page.corners.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(';')
  return [
    page.id,
    page.rotation,
    page.flipX ? 'h' : '',
    page.flipY ? 'v' : '',
    corners,
    JSON.stringify(page.adjustments),
    JSON.stringify(page.filterStrengths ?? {}),
  ].join('|')
}

/**
 * 主流扫描应用的滤镜条：每个滤镜使用当前页真实渲染的低分辨率缩略图，
 * 而不是静态图标，切换所见即所得。
 */
export function FilterStrip({ page, activeFilter, onSelect }: FilterStripProps) {
  const [category, setCategory] = useState<FilterCategoryId>('recommended')
  const [thumbs, setThumbs] = useState<Partial<Record<FilterId, string>>>({})
  const stripRef = useRef<HTMLDivElement>(null)
  const buttonsRef = useRef<Partial<Record<FilterId, HTMLButtonElement>>>({})
  const cacheRef = useRef<Map<string, Map<FilterId, string>>>(new Map())

  useEffect(() => {
    const hash = pageHash(page)
    let disposed = false
    let cache = cacheRef.current.get(hash)
    if (!cache) {
      cache = new Map()
      cacheRef.current.set(hash, cache)
      while (cacheRef.current.size > 2) {
        const oldestKey = cacheRef.current.keys().next().value
        if (oldestKey === undefined) break
        const oldest = cacheRef.current.get(oldestKey)
        oldest?.forEach((url) => URL.revokeObjectURL(url))
        cacheRef.current.delete(oldestKey)
      }
    }
    setThumbs(Object.fromEntries(cache) as Partial<Record<FilterId, string>>)
    const run = async () => {
      for (const filter of FILTERS) {
        if (disposed) return
        if (cache.has(filter.id)) continue
        try {
          const rendered = await renderScan(
            page.sourceUrl,
            page.corners,
            page.rotation,
            filter.id,
            filterStrengthFor(page, filter.id),
            150,
            0.68,
            page.adjustments,
            page.flipX,
            page.flipY,
          )
          if (disposed) {
            URL.revokeObjectURL(rendered.url)
            return
          }
          cache.set(filter.id, rendered.url)
          setThumbs(Object.fromEntries(cache) as Partial<Record<FilterId, string>>)
        } catch {
          // 单个滤镜缩略图失败时保留图标回退
        }
      }
    }
    void run()
    return () => { disposed = true }
  }, [page])

  useEffect(() => {
    const found = FILTERS.find((filter) => filter.id === activeFilter)
    if (found) setCategory(found.category)
    const frame = window.requestAnimationFrame(() => {
      buttonsRef.current[activeFilter]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeFilter])

  const jumpToCategory = (next: FilterCategoryId) => {
    setCategory(next)
    const first = FILTERS.find((filter) => filter.category === next)
    if (first) buttonsRef.current[first.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  return (
    <>
      <div class="filter-category-tabs" role="tablist" aria-label="滤镜场景分类">
        {FILTER_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={category === item.id}
            class={category === item.id ? 'active' : ''}
            onClick={() => jumpToCategory(item.id)}
          >{item.label}</button>
        ))}
      </div>
      <div ref={stripRef} class="filter-strip">
        {FILTERS.map((filter) => {
          const Icon = filter.icon
          const thumb = thumbs[filter.id]
          return (
            <button
              ref={(node) => { buttonsRef.current[filter.id] = node ?? undefined }}
              key={filter.id}
              type="button"
              class={page.filter === filter.id ? `filter-option active filter-${filter.id}` : `filter-option filter-${filter.id}`}
              onClick={() => onSelect(filter.id)}
              title={filter.hint}
            >
              <span class="filter-thumb">
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon size={18} />}
              </span>
              <span>{filter.label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
