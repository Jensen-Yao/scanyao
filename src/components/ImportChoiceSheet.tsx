import { Files, Images, X } from 'lucide-preact'

interface ImportChoiceSheetProps {
  selectedCount: number
  onSeparate: () => void
  onMerge: () => void
  onClose: () => void
}

export function ImportChoiceSheet({ selectedCount, onSeparate, onMerge, onClose }: ImportChoiceSheetProps) {
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <section class="sheet import-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="import-choice-title" onClick={(event) => event.stopPropagation()}>
        <div class="sheet-heading">
          <div><p>{selectedCount > 0 ? `已选择 ${selectedCount} 张图片` : '导入方式'}</p><h2 id="import-choice-title">这些图片要怎样处理？</h2></div>
          <button type="button" class="icon-button" onClick={onClose} aria-label="关闭导入方式"><X size={18} /></button>
        </div>
        <div class="import-choice-actions">
          <button type="button" class="sheet-option primary-option" onClick={onSeparate}><span class="sheet-icon jpg"><Files size={21} /></span><span><strong>按页导入</strong><small>每张图片成为一页，分别校正和增强</small></span></button>
          <button type="button" class="sheet-option" onClick={onMerge}><span class="sheet-icon merge"><Images size={21} /></span><span><strong>原图先拼合再编辑</strong><small>进入独立画布，添加图片、选模板并拖动位置</small></span></button>
        </div>
      </section>
    </div>
  )
}
