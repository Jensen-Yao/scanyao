import { History, Redo2, RotateCcw, Undo2, X } from 'lucide-preact'

export interface ActivityRecord {
  id: string
  label: string
  at: number
}

interface HistorySheetProps {
  records: ActivityRecord[]
  canUndo: boolean
  canRedo: boolean
  canReset: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onClose: () => void
}

export function HistorySheet({ records, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onClose }: HistorySheetProps) {
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <section class="sheet history-sheet" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(event) => event.stopPropagation()}>
        <div class="sheet-heading">
          <div><p>当前编辑会话</p><h2 id="history-title">操作历史</h2></div>
          <button type="button" class="icon-button" onClick={onClose} aria-label="关闭操作历史"><X size={18} /></button>
        </div>
        <div class="history-command-row">
          <button type="button" onClick={onUndo} disabled={!canUndo}><Undo2 size={17} /><span>撤销</span></button>
          <button type="button" onClick={onRedo} disabled={!canRedo}><Redo2 size={17} /><span>重做</span></button>
          <button type="button" onClick={onReset} disabled={!canReset}><RotateCcw size={17} /><span>重置当前页</span></button>
        </div>
        <div class="history-list" aria-label="最近操作">
          {records.length === 0 ? <div class="history-empty"><History size={25} /><span>完成编辑后，操作会显示在这里</span></div> : records.slice().reverse().map((record, index) => (
            <div class="history-row" key={record.id}>
              <span class={index === 0 ? 'history-marker current' : 'history-marker'} />
              <span><strong>{record.label}</strong><small>{new Date(record.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
