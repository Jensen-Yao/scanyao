import { Archive, Download, FileImage, FileText, Layers3, X } from 'lucide-preact'
import type { ExportOptions, ExportQuality, MergeLayout, PdfPageSize } from '../types'

interface ExportSheetProps {
  documentName: string
  options: ExportOptions
  pageCount: number
  currentIndex: number
  busy: boolean
  onNameChange: (name: string) => void
  onOptionsChange: (patch: Partial<ExportOptions>) => void
  onClose: () => void
  onPdf: () => void
  onJpg: () => void
  onZip: () => void
  onMerge: () => void
}

const QUALITY_OPTIONS: { id: ExportQuality; label: string }[] = [
  { id: 'compact', label: '小体积' },
  { id: 'balanced', label: '均衡' },
  { id: 'best', label: '高清' },
]

export function ExportSheet({
  documentName,
  options,
  pageCount,
  currentIndex,
  busy,
  onNameChange,
  onOptionsChange,
  onClose,
  onPdf,
  onJpg,
  onZip,
  onMerge,
}: ExportSheetProps) {
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <section class="sheet export-sheet" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}>
        <div class="sheet-heading">
          <div><p>本地生成</p><h2 id="export-title">导出扫描件</h2></div>
          <button type="button" class="icon-button" onClick={onClose} aria-label="关闭导出窗口"><X size={18} /></button>
        </div>
        <div class="export-settings">
          <label class="field-label" for="document-name">文件名称</label>
          <input id="document-name" class="text-field" value={documentName} onInput={(event) => onNameChange((event.currentTarget as HTMLInputElement).value)} />
          <span class="field-label">输出质量</span>
          <div class="segmented-control wide" role="group" aria-label="输出质量">
            {QUALITY_OPTIONS.map((quality) => (
              <button type="button" class={options.quality === quality.id ? 'segment active' : 'segment'} onClick={() => onOptionsChange({ quality: quality.id })} key={quality.id}>{quality.label}</button>
            ))}
          </div>
          <div class="field-grid">
            <label class="select-field" for="pdf-size"><span>PDF 纸张</span><select id="pdf-size" value={options.pageSize} onChange={(event) => onOptionsChange({ pageSize: (event.currentTarget as HTMLSelectElement).value as PdfPageSize })}><option value="auto">贴合内容</option><option value="a4">A4</option><option value="letter">Letter</option></select></label>
            <label class="toggle-field"><span><strong>留白边距</strong><small>适合打印与装订</small></span><input type="checkbox" checked={options.margin} onChange={(event) => onOptionsChange({ margin: (event.currentTarget as HTMLInputElement).checked })} /></label>
          </div>
          <label class="select-field merge-field" for="merge-layout"><span>图片合并布局</span><select id="merge-layout" value={options.mergeLayout} onChange={(event) => onOptionsChange({ mergeLayout: (event.currentTarget as HTMLSelectElement).value as MergeLayout })}><option value="vertical">纵向长图</option><option value="horizontal">横向拼接</option><option value="grid">双列拼图</option></select></label>
        </div>
        <div class="export-actions">
          <button type="button" class="sheet-option primary-option" onClick={onPdf} disabled={busy || pageCount === 0}><span class="sheet-icon pdf"><FileText size={21} /></span><span><strong>多页 PDF</strong><small>{pageCount} 页合并为一个文档</small></span><Download size={17} /></button>
          <button type="button" class="sheet-option" onClick={onJpg} disabled={busy || currentIndex < 0}><span class="sheet-icon jpg"><FileImage size={21} /></span><span><strong>当前页 JPG</strong><small>导出正在编辑的第 {Math.max(0, currentIndex + 1)} 页</small></span><Download size={17} /></button>
          <button type="button" class="sheet-option" onClick={onMerge} disabled={busy || pageCount === 0}><span class="sheet-icon merge"><Layers3 size={21} /></span><span><strong>合并为一张图片</strong><small>使用当前布局合并全部 {pageCount} 页</small></span><Download size={17} /></button>
          <button type="button" class="sheet-option" onClick={onZip} disabled={busy || pageCount === 0}><span class="sheet-icon zip"><Archive size={21} /></span><span><strong>全部 JPG 压缩包</strong><small>按页码整理为一个 ZIP</small></span><Download size={17} /></button>
        </div>
      </section>
    </div>
  )
}
