import { ChevronLeft, ChevronRight, Copy, Layers3, Trash2, WandSparkles, X } from 'lucide-preact'
import type { ScanPage } from '../types'

interface PageManagerProps {
  pages: ScanPage[]
  selectedId: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onMove: (id: string, offset: -1 | 1) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onApplyAll: () => void
  onClear: () => void
}

export function PageManager({
  pages,
  selectedId,
  onClose,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
  onApplyAll,
  onClear,
}: PageManagerProps) {
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <section class="sheet page-manager" role="dialog" aria-modal="true" aria-labelledby="pages-title" onClick={(event) => event.stopPropagation()}>
        <div class="sheet-heading">
          <div><p>多页文档</p><h2 id="pages-title">整理扫描页</h2></div>
          <button type="button" class="icon-button" onClick={onClose} aria-label="关闭页面管理"><X size={18} /></button>
        </div>
        <div class="sheet-command-row">
          <button type="button" class="quiet-button compact" onClick={onApplyAll} disabled={!selectedId || pages.length < 2}>
            <WandSparkles size={16} />套用当前增强
          </button>
          <button type="button" class="danger-button compact" onClick={onClear} disabled={pages.length === 0}>
            <Trash2 size={16} />清空文档
          </button>
        </div>
        <div class="page-manager-list">
          {pages.map((page, index) => (
            <div class={page.id === selectedId ? 'page-row active' : 'page-row'} key={page.id}>
              <button type="button" class="page-row-main" onClick={() => onSelect(page.id)}>
                <span class="page-row-thumb"><img src={page.sourceUrl} alt="" /><small>{index + 1}</small></span>
                <span class="page-row-copy"><strong>第 {index + 1} 页</strong><small>{page.fileName}</small></span>
              </button>
              <div class="page-row-actions">
                <button type="button" class="icon-button subtle" onClick={() => onMove(page.id, -1)} disabled={index === 0} aria-label="向前移动" title="向前移动"><ChevronLeft size={17} /></button>
                <button type="button" class="icon-button subtle" onClick={() => onMove(page.id, 1)} disabled={index === pages.length - 1} aria-label="向后移动" title="向后移动"><ChevronRight size={17} /></button>
                <button type="button" class="icon-button subtle" onClick={() => onDuplicate(page.id)} aria-label="复制页面" title="复制页面"><Copy size={16} /></button>
                <button type="button" class="icon-button subtle danger-icon" onClick={() => onDelete(page.id)} aria-label="删除页面" title="删除页面"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {pages.length === 0 && <div class="sheet-empty"><Layers3 size={24} /><span>还没有扫描页</span></div>}
        </div>
      </section>
    </div>
  )
}
