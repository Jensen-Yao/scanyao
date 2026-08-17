import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  Aperture, ArrowLeft, Check, ChevronDown, Download, FileImage, FilePlus2, FileText,
  Grid2X2, ImagePlus, Layers3, Moon, MoreHorizontal, RotateCw, ScanLine, Settings2,
  Sparkles, Sun, Trash2, Upload, WandSparkles, X,
} from 'lucide-preact'
import { CropCanvas } from './components/CropCanvas'
import { DEFAULT_CORNERS, type CornerSet } from './core/geometry'
import { createPdf } from './core/pdf'
import { detectDocumentCorners, renderScan, type FilterId } from './core/imageEngine'
import { saveBlob } from './core/platform'
import type { ScanPage } from './types'
import './app.css'

type EditorMode = 'crop' | 'filter'
type Theme = 'light' | 'dark'

const FILTERS: { id: FilterId; label: string; icon: typeof FileText; hint: string }[] = [
  { id: 'original', label: '原图', icon: FileImage, hint: '保留原色' },
  { id: 'clean', label: '净化', icon: WandSparkles, hint: '提亮纸张' },
  { id: 'enhance', label: '增强', icon: Sparkles, hint: '提升对比' },
  { id: 'grayscale', label: '灰度', icon: ScanLine, hint: '低饱和灰阶' },
  { id: 'bw', label: '黑白', icon: FileText, hint: '纯黑白文档' },
]

const idFor = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const cloneCorners = (corners: CornerSet) => corners.map((corner) => ({ ...corner })) as CornerSet
const fileStem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'scan'

export function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('scanyao-theme') as Theme) || 'light')
  const [pages, setPages] = useState<ScanPage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('crop')
  const [preview, setPreview] = useState<{ id: string; url: string; width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const activePage = useMemo(() => pages.find((page) => page.id === selectedId) ?? null, [pages, selectedId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('scanyao-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!activePage) { setPreview(null); return }
    let disposed = false
    const timer = window.setTimeout(() => {
      void renderScan(activePage.sourceUrl, activePage.corners, activePage.rotation, activePage.filter, activePage.strength, 1500, 0.82)
        .then((result) => {
          if (disposed) { URL.revokeObjectURL(result.url); return }
          setPreview((previous) => {
            if (previous && previous.url !== result.url) URL.revokeObjectURL(previous.url)
            return { id: activePage.id, url: result.url, width: result.width, height: result.height }
          })
        })
        .catch(() => setToast('预览生成失败，请换一张图片再试。'))
    }, 120)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [activePage])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const updateActive = useCallback((patch: Partial<ScanPage>) => {
    if (!selectedId) return
    setPages((current) => current.map((page) => (page.id === selectedId ? { ...page, ...patch } : page)))
  }, [selectedId])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) { setToast('请选择 JPG、PNG 或 HEIC 图片。'); return }
    setBusy(true)
    try {
      const added: ScanPage[] = []
      for (const file of imageFiles) {
        const sourceUrl = URL.createObjectURL(file)
        const corners = await detectDocumentCorners(sourceUrl)
        added.push({ id: idFor(), fileName: file.name, sourceUrl, sourceFile: file, corners, rotation: 0, filter: 'clean', strength: 0.86, createdAt: Date.now() })
      }
      setPages((current) => [...current, ...added])
      setSelectedId(added[0]?.id ?? null)
      setMode('crop')
      setToast(`${added.length} 页已加入工作台`)
    } catch { setToast('读取图片失败，请检查文件是否完整。') } finally { setBusy(false) }
  }, [])

  const onInputChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    if (input.files) void addFiles(input.files)
    input.value = ''
  }

  const resetCorners = () => updateActive({ corners: cloneCorners(DEFAULT_CORNERS) })
  const rotate = () => updateActive({ rotation: ((activePage?.rotation ?? 0) + 90) % 360 })

  const deletePage = () => {
    if (!activePage) return
    URL.revokeObjectURL(activePage.sourceUrl)
    if (preview?.id === activePage.id) URL.revokeObjectURL(preview.url)
    const remaining = pages.filter((page) => page.id !== activePage.id)
    setPages(remaining)
    setSelectedId(remaining.at(-1)?.id ?? null)
  }

  const exportJpg = async () => {
    if (!activePage) return
    setBusy(true)
    try {
      const result = await renderScan(activePage.sourceUrl, activePage.corners, activePage.rotation, activePage.filter, activePage.strength, 3200, 0.94)
      await saveBlob(result.blob, `${fileStem(activePage.fileName)}-scanyao.jpg`, '导出扫描 JPG')
      URL.revokeObjectURL(result.url); setExportOpen(false); setToast('JPG 已准备好')
    } catch { setToast('JPG 导出失败。') } finally { setBusy(false) }
  }

  const exportPdf = async () => {
    if (pages.length === 0) return
    setBusy(true)
    try {
      const jpegPages = []
      for (const page of pages) {
        const result = await renderScan(page.sourceUrl, page.corners, page.rotation, page.filter, page.strength, 3200, 0.94)
        jpegPages.push({ bytes: new Uint8Array(await result.blob.arrayBuffer()), width: result.width, height: result.height })
        URL.revokeObjectURL(result.url)
      }
      const pdf = createPdf(jpegPages)
      await saveBlob(new Blob([pdf], { type: 'application/pdf' }), `${fileStem(pages[0].fileName)}-scanyao.pdf`, '导出扫描 PDF')
      setExportOpen(false); setToast(`${pages.length} 页 PDF 已准备好`)
    } catch { setToast('PDF 导出失败。') } finally { setBusy(false) }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    if (event.dataTransfer?.files) void addFiles(event.dataTransfer.files)
  }
  const selectedFilter = FILTERS.find((filter) => filter.id === activePage?.filter) ?? FILTERS[0]

  return (
    <div class="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <aside class="sidebar">
        <div class="brand-lockup"><div class="brand-mark"><img src="./brand/scanyao-icon.png" alt="" /></div><div><strong>扫耀</strong><span>ScanYao</span></div></div>
        <nav class="side-nav" aria-label="主导航">
          <button class="nav-item active" type="button"><Grid2X2 size={17} /><span>工作台</span><small>{pages.length}</small></button>
          <button class="nav-item" type="button" onClick={() => setExportOpen(true)} disabled={pages.length === 0}><Layers3 size={17} /><span>导出队列</span><small>{pages.length ? 'PDF' : '—'}</small></button>
        </nav>
        <div class="sidebar-spacer" />
        <div class="local-note"><span class="status-dot" />本地处理<br /><small>图片不会离开设备</small></div>
        <button class="theme-toggle" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="切换深浅色主题" title="切换深浅色主题">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === 'light' ? '深色外观' : '浅色外观'}</span></button>
        <div class="sidebar-footer">v0.1 · MIT + 复用许可</div>
      </aside>

      <main class="main-content">
        <header class="topbar"><div class="page-heading"><p>扫描工作台</p><h1>{activePage ? fileStem(activePage.fileName) : '准备扫描'}</h1></div><div class="top-actions"><button class="quiet-button" type="button" onClick={() => fileInput.current?.click()}><Upload size={16} />导入图片</button><button class="primary-button" type="button" onClick={() => cameraInput.current?.click()}><Aperture size={17} />拍摄</button>{pages.length > 0 && <button class="icon-button" type="button" onClick={() => setExportOpen(true)} aria-label="导出" title="导出"><Download size={18} /></button>}</div></header>

        {!activePage ? <section class="empty-state" aria-label="开始扫描"><div class="empty-icon"><ScanLine size={34} strokeWidth={1.7} /></div><p class="eyebrow">LOCAL-FIRST SCANNER</p><h2>把纸张，变成清晰的数字文件。</h2><p class="empty-copy">导入照片或直接拍摄。四角校正、文档增强与 PDF 导出都在本机完成。</p><div class="empty-actions"><button class="primary-button large" type="button" onClick={() => cameraInput.current?.click()}><Aperture size={18} />拍一张</button><button class="quiet-button large" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={18} />从相册导入</button></div><div class="drop-hint"><FilePlus2 size={15} />也可以把图片拖到这里</div></section> : <section class="workspace">
          <div class="editor-column"><div class="canvas-panel"><div class="canvas-toolbar"><div class="segmented-control" role="tablist" aria-label="编辑模式"><button type="button" class={mode === 'crop' ? 'segment active' : 'segment'} onClick={() => setMode('crop')}><ScanLine size={15} />校正</button><button type="button" class={mode === 'filter' ? 'segment active' : 'segment'} onClick={() => setMode('filter')}><Sparkles size={15} />增强</button></div><div class="canvas-toolbar-actions"><span class="canvas-meta">{activePage.fileName}</span><button class="icon-button subtle" type="button" onClick={rotate} aria-label="旋转 90 度" title="旋转 90 度"><RotateCw size={17} /></button><button class="icon-button subtle" type="button" onClick={deletePage} aria-label="删除当前页" title="删除当前页"><Trash2 size={17} /></button></div></div><div class="canvas-stage">{mode === 'crop' ? <CropCanvas imageUrl={activePage.sourceUrl} corners={activePage.corners} onChange={(corners) => updateActive({ corners })} /> : preview ? <img class="processed-preview" src={preview.url} alt="扫描预览" /> : <div class="processing-state"><Sparkles size={20} />正在生成预览…</div>}{busy && <div class="busy-overlay"><span class="spinner" />正在处理</div>}</div><div class="canvas-footer"><span><Check size={14} />调整会即时保存到当前页</span><span>{preview ? `${preview.width} × ${preview.height}` : '预览等待中'}</span></div></div>
            <div class="page-strip" aria-label="扫描页列表"><div class="page-strip-label"><span>页码</span><strong>{pages.length.toString().padStart(2, '0')}</strong></div><div class="thumb-list">{pages.map((page, index) => <button type="button" class={page.id === selectedId ? 'thumb active' : 'thumb'} onClick={() => setSelectedId(page.id)} key={page.id} aria-label={`第 ${index + 1} 页`}><img src={page.sourceUrl} alt="" /><span>{index + 1}</span></button>)}<button type="button" class="add-thumb" onClick={() => fileInput.current?.click()} aria-label="添加页面" title="添加页面"><FilePlus2 size={18} /></button></div><button class="strip-more" type="button" aria-label="更多页面操作" title="更多页面操作"><MoreHorizontal size={18} /></button></div>
          </div>
          <aside class="inspector"><div class="inspector-header"><div><p>当前页面</p><h2>编辑扫描件</h2></div><Settings2 size={18} /></div><div class="inspector-scroll"><section class="control-section"><div class="section-heading"><span>扫描范围</span><button type="button" class="text-button" onClick={resetCorners}>重置</button></div><button type="button" class="auto-detect" onClick={async () => { setBusy(true); try { updateActive({ corners: await detectDocumentCorners(activePage.sourceUrl) }); setToast('已重新识别四角') } finally { setBusy(false) } }}><WandSparkles size={16} /><span><strong>自动识别边缘</strong><small>拖动四个蓝点也可微调</small></span><ChevronDown size={15} /></button></section><section class="control-section"><div class="section-heading"><span>滤镜</span><span class="muted-value">{selectedFilter.label}</span></div><div class="filter-grid">{FILTERS.map((filter) => { const Icon = filter.icon; return <button key={filter.id} type="button" class={activePage.filter === filter.id ? 'filter-option active' : 'filter-option'} onClick={() => { updateActive({ filter: filter.id }); setMode('filter') }}><Icon size={17} /><span>{filter.label}</span></button> })}</div><div class="range-row"><label for="filter-strength">强度</label><output>{Math.round(activePage.strength * 100)}%</output></div><input id="filter-strength" class="range" type="range" min="0" max="100" value={Math.round(activePage.strength * 100)} onInput={(event) => updateActive({ strength: Number((event.currentTarget as HTMLInputElement).value) / 100 })} /></section><section class="control-section"><div class="section-heading"><span>输出</span><span class="muted-value">{pages.length} 页</span></div><div class="output-actions"><button type="button" class="output-button" onClick={exportJpg}><FileImage size={17} /><span>当前页 JPG</span><ArrowLeft size={15} class="rotate-180" /></button><button type="button" class="output-button primary" onClick={exportPdf}><FileText size={17} /><span>全部导出 PDF</span><Download size={15} /></button></div></section></div></aside>
        </section>}
      </main>

      <nav class="mobile-nav" aria-label="移动端导航"><button type="button" class="active"><Grid2X2 size={18} /><span>工作台</span></button><button type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={18} /><span>导入</span></button><button type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}<span>外观</span></button></nav>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onInputChange} /><input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onInputChange} />
      {exportOpen && <div class="modal-backdrop" onClick={() => setExportOpen(false)}><section class="export-sheet" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}><div class="sheet-heading"><div><p>导出扫描件</p><h2 id="export-title">选择文件格式</h2></div><button type="button" class="icon-button" onClick={() => setExportOpen(false)} aria-label="关闭导出窗口"><X size={18} /></button></div><button type="button" class="sheet-option" onClick={exportPdf}><span class="sheet-icon pdf"><FileText size={21} /></span><span><strong>PDF 文档</strong><small>将 {pages.length} 页合并为一份清晰 PDF</small></span><Download size={17} /></button><button type="button" class="sheet-option" onClick={exportJpg}><span class="sheet-icon jpg"><FileImage size={21} /></span><span><strong>JPG 图片</strong><small>导出当前正在编辑的第 {pages.findIndex((page) => page.id === selectedId) + 1} 页</small></span><Download size={17} /></button></section></div>}
      {toast && <div class="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}
