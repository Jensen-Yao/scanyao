import { ArrowDownToLine, ArrowUpToLine, Columns3, Combine, Grid2X2, Images, Maximize2, Move, Plus, Rows3, Trash2, X, ZoomIn, ZoomOut } from 'lucide-preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  calculateCompositionLayout,
  type CompositionMode,
  type NormalizedCompositionPlacement,
} from '../core/compositor'
import { loadImage } from '../core/imageEngine'

export interface MergeInitialItem {
  id: string
  file: File
  url?: string
  pageId?: string
}

export interface MergeStudioSource {
  id: string
  name: string
  file: File
  url: string
  width: number
  height: number
  pageId?: string
  ownedUrl: boolean
}

export interface MergeStudioResult {
  sources: MergeStudioSource[]
  placements: NormalizedCompositionPlacement[]
  aspectRatio: number
  keepOriginals: boolean
}

interface SourceMergeSheetProps {
  initialItems: MergeInitialItem[]
  replacePageCount: number
  busy: boolean
  onClose: () => void
  onConfirm: (result: MergeStudioResult) => void
}

type MergeTemplate = CompositionMode | 'collage'

const MIN_STAGE_ZOOM = 1
const MAX_STAGE_ZOOM = 2.5
const STAGE_ZOOM_STEP = 0.25

const TEMPLATES: { id: MergeTemplate; label: string; icon: typeof Rows3 }[] = [
  { id: 'vertical', label: '纵向长图', icon: Rows3 },
  { id: 'horizontal', label: '横向拼接', icon: Columns3 },
  { id: 'grid', label: '双列网格', icon: Grid2X2 },
  { id: 'collage', label: '自由画布', icon: Move },
]

function fitInside(
  source: Pick<MergeStudioSource, 'width' | 'height'>,
  box: NormalizedCompositionPlacement,
  canvasAspect: number,
) {
  const sourceAspect = source.width / source.height
  const boxAspect = (box.width * canvasAspect) / box.height
  if (sourceAspect > boxAspect) {
    const height = (box.width * canvasAspect) / sourceAspect
    return { x: box.x, y: box.y + (box.height - height) / 2, width: box.width, height }
  }
  const width = (box.height * sourceAspect) / canvasAspect
  return { x: box.x + (box.width - width) / 2, y: box.y, width, height: box.height }
}

function templateLayout(sources: MergeStudioSource[], template: MergeTemplate) {
  if (sources.length === 0) return { aspectRatio: 1, placements: [] as NormalizedCompositionPlacement[] }
  if (template !== 'collage') {
    const layout = calculateCompositionLayout(sources, template, 28, 6000)
    return {
      aspectRatio: layout.width / layout.height,
      placements: layout.placements.map((placement) => ({
        x: placement.x / layout.width,
        y: placement.y / layout.height,
        width: placement.width / layout.width,
        height: placement.height / layout.height,
      })),
    }
  }

  const aspectRatio = sources.length <= 2 ? 4 / 3 : 1
  const columns = sources.length === 1 ? 1 : 2
  const rows = Math.ceil(sources.length / columns)
  const gap = 0.035
  const outer = 0.055
  const cellWidth = (1 - outer * 2 - gap * (columns - 1)) / columns
  const cellHeight = (1 - outer * 2 - gap * (rows - 1)) / rows
  const placements = sources.map((source, index) => fitInside(source, {
    x: outer + (index % columns) * (cellWidth + gap),
    y: outer + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }, aspectRatio))
  return { aspectRatio, placements }
}

export function SourceMergeSheet({ initialItems, replacePageCount, busy, onClose, onConfirm }: SourceMergeSheetProps) {
  const [sources, setSources] = useState<MergeStudioSource[]>([])
  const [placements, setPlacements] = useState<NormalizedCompositionPlacement[]>([])
  const [aspectRatio, setAspectRatio] = useState(1)
  const [template, setTemplate] = useState<MergeTemplate>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keepOriginals, setKeepOriginals] = useState(true)
  const [loading, setLoading] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 320, height: 320 })
  const [stageZoom, setStageZoom] = useState(1)
  const fileInput = useRef<HTMLInputElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const stageShell = useRef<HTMLDivElement>(null)
  const ownedUrls = useRef(new Set<string>())
  const drag = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    placement: NormalizedCompositionPlacement
  } | null>(null)

  const selectedIndex = useMemo(() => sources.findIndex((source) => source.id === selectedId), [sources, selectedId])

  const loadItems = async (items: MergeInitialItem[]) => {
    const loaded: MergeStudioSource[] = []
    for (const item of items) {
      const ownedUrl = !item.url
      const url = item.url ?? URL.createObjectURL(item.file)
      if (ownedUrl) ownedUrls.current.add(url)
      try {
        const image = await loadImage(url)
        loaded.push({
          id: item.id,
          name: item.file.name,
          file: item.file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          pageId: item.pageId,
          ownedUrl,
        })
      } catch {
        if (ownedUrl) {
          URL.revokeObjectURL(url)
          ownedUrls.current.delete(url)
        }
      }
    }
    return loaded
  }

  useEffect(() => {
    let disposed = false
    setLoading(true)
    void loadItems(initialItems).then((loaded) => {
      if (disposed) return
      const initialTemplate: MergeTemplate = loaded.length > 2 ? 'grid' : 'horizontal'
      const nextLayout = templateLayout(loaded, initialTemplate)
      setSources(loaded)
      setTemplate(initialTemplate)
      setPlacements(nextLayout.placements)
      setAspectRatio(nextLayout.aspectRatio)
      setSelectedId(loaded[0]?.id ?? null)
    }).finally(() => {
      if (!disposed) setLoading(false)
    })
    return () => {
      disposed = true
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
      ownedUrls.current.clear()
    }
  }, [])

  useEffect(() => {
    const container = stageShell.current
    if (!container) return
    const resize = () => {
      const bounds = container.getBoundingClientRect()
      const inset = window.innerWidth <= 820 ? 20 : 36
      const availableWidth = Math.max(120, bounds.width - inset)
      const availableHeight = Math.max(120, bounds.height - inset)
      const width = Math.min(availableWidth, availableHeight * aspectRatio)
      setStageSize({ width, height: width / aspectRatio })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    return () => observer.disconnect()
  }, [aspectRatio])

  const applyTemplate = (nextTemplate: MergeTemplate, nextSources = sources) => {
    const next = templateLayout(nextSources, nextTemplate)
    setTemplate(nextTemplate)
    setAspectRatio(next.aspectRatio)
    setPlacements(next.placements)
    setStageZoom(1)
    stageShell.current?.scrollTo({ left: 0, top: 0 })
  }

  const changeStageZoom = (nextZoom: number) => {
    const container = stageShell.current
    const currentWidth = Math.max(1, stageSize.width * stageZoom)
    const currentHeight = Math.max(1, stageSize.height * stageZoom)
    const centerX = container ? (container.scrollLeft + container.clientWidth / 2) / currentWidth : 0.5
    const centerY = container ? (container.scrollTop + container.clientHeight / 2) / currentHeight : 0.5
    const zoom = Math.max(MIN_STAGE_ZOOM, Math.min(MAX_STAGE_ZOOM, nextZoom))
    setStageZoom(zoom)
    window.requestAnimationFrame(() => {
      if (!container) return
      container.scrollLeft = Math.max(0, centerX * stageSize.width * zoom - container.clientWidth / 2)
      container.scrollTop = Math.max(0, centerY * stageSize.height * zoom - container.clientHeight / 2)
    })
  }

  const fitStage = () => {
    setStageZoom(1)
    window.requestAnimationFrame(() => stageShell.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' }))
  }

  const addFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    setLoading(true)
    try {
      const loaded = await loadItems(imageFiles.map((file, index) => ({
        id: `merge-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        file,
      })))
      const nextSources = [...sources, ...loaded]
      setSources(nextSources)
      setSelectedId(loaded.at(-1)?.id ?? selectedId)
      applyTemplate(template, nextSources)
    } finally {
      setLoading(false)
    }
  }

  const removeSource = (index: number) => {
    const source = sources[index]
    if (!source) return
    if (source.ownedUrl) {
      URL.revokeObjectURL(source.url)
      ownedUrls.current.delete(source.url)
    }
    const nextSources = sources.filter((_, sourceIndex) => sourceIndex !== index)
    setSources(nextSources)
    setPlacements(placements.filter((_, placementIndex) => placementIndex !== index))
    setSelectedId(nextSources[Math.min(index, nextSources.length - 1)]?.id ?? null)
  }

  const moveLayer = (direction: -1 | 1) => {
    if (selectedIndex < 0) return
    const target = selectedIndex + direction
    if (target < 0 || target >= sources.length) return
    const nextSources = [...sources]
    const nextPlacements = [...placements]
    ;[nextSources[selectedIndex], nextSources[target]] = [nextSources[target], nextSources[selectedIndex]]
    ;[nextPlacements[selectedIndex], nextPlacements[target]] = [nextPlacements[target], nextPlacements[selectedIndex]]
    setSources(nextSources)
    setPlacements(nextPlacements)
  }

  const onPointerDown = (event: PointerEvent, sourceId: string, index: number) => {
    const placement = placements[index]
    if (!placement) return
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
    setSelectedId(sourceId)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = {
      id: sourceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      placement: { ...placement },
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const currentDrag = drag.current
    const bounds = stage.current?.getBoundingClientRect()
    if (!currentDrag || !bounds || currentDrag.pointerId !== event.pointerId) return
    if (event.cancelable) event.preventDefault()
    const index = sources.findIndex((source) => source.id === currentDrag.id)
    if (index < 0) return
    const dx = (event.clientX - currentDrag.startX) / bounds.width
    const dy = (event.clientY - currentDrag.startY) / bounds.height
    setPlacements((current) => current.map((placement, placementIndex) => placementIndex === index ? {
      ...placement,
      x: Math.max(0, Math.min(1 - placement.width, currentDrag.placement.x + dx)),
      y: Math.max(0, Math.min(1 - placement.height, currentDrag.placement.y + dy)),
    } : placement))
  }

  const onPointerUp = (event: PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    drag.current = null
  }

  return (
    <div class="modal-backdrop merge-backdrop" onClick={onClose}>
      <section class="sheet source-merge-studio" role="dialog" aria-modal="true" aria-labelledby="source-merge-title" onClick={(event) => event.stopPropagation()}>
        <div class="merge-studio-heading">
          <div><p>处理图像前</p><h2 id="source-merge-title">原图拼合工作台</h2></div>
          <div class="merge-heading-actions">
            <button type="button" class="quiet-button compact" onClick={() => fileInput.current?.click()}><Plus size={15} />添加图片</button>
            <button type="button" class="icon-button" onClick={onClose} aria-label="关闭原图拼合"><X size={18} /></button>
          </div>
        </div>

        <div class="merge-studio-body">
          <div class="merge-stage-column">
            <div ref={stageShell} class="merge-stage-shell">
              <div class="merge-stage-scroll-content" style={{ width: `max(100%, ${stageSize.width * stageZoom + 20}px)`, height: `max(100%, ${stageSize.height * stageZoom + 20}px)` }}>
                <div ref={stage} class={sources.length === 0 ? 'merge-stage empty' : 'merge-stage'} style={{ aspectRatio, width: `${stageSize.width * stageZoom}px`, height: `${stageSize.height * stageZoom}px` }} onClick={() => setSelectedId(null)}>
                  {sources.map((source, index) => {
                    const placement = placements[index]
                    if (!placement) return null
                    return (
                      <button
                        type="button"
                        key={source.id}
                        class={selectedId === source.id ? 'merge-canvas-item active' : 'merge-canvas-item'}
                        style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, height: `${placement.height * 100}%` }}
                        onPointerDown={(event) => onPointerDown(event, source.id, index)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onLostPointerCapture={onPointerUp}
                        aria-label={`拖动 ${source.name}`}
                      ><img src={source.url} alt="" draggable={false} /></button>
                    )
                  })}
                  {sources.length === 0 && <button type="button" class="merge-empty-action" onClick={() => fileInput.current?.click()}><Images size={28} /><strong>添加要拼合的原图</strong><span>至少选择两张，可继续追加</span></button>}
                </div>
              </div>
            </div>
            <div class="merge-stage-status"><span class="merge-drag-status"><Move size={14} />移动图片</span><div class="merge-zoom-controls" role="group" aria-label="画布缩放"><button type="button" onClick={() => changeStageZoom(stageZoom - STAGE_ZOOM_STEP)} disabled={stageZoom <= MIN_STAGE_ZOOM} aria-label="缩小画布" title="缩小画布"><ZoomOut size={14} /></button><output>{Math.round(stageZoom * 100)}%</output><button type="button" onClick={() => changeStageZoom(stageZoom + STAGE_ZOOM_STEP)} disabled={stageZoom >= MAX_STAGE_ZOOM} aria-label="放大画布" title="放大画布"><ZoomIn size={14} /></button><button type="button" onClick={fitStage} disabled={stageZoom === 1} aria-label="适合窗口" title="适合窗口"><Maximize2 size={14} /></button></div><span class="merge-source-count">{sources.length} 张</span></div>
          </div>

          <aside class="merge-controls">
            <div class="merge-controls-scroll">
              <section class="merge-control-section">
                <div class="section-heading"><span>预设模板</span><span class="muted-value">可拖动微调</span></div>
                <div class="merge-template-grid">
                  {TEMPLATES.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} class={template === item.id ? 'active' : ''} onClick={() => applyTemplate(item.id)}><Icon size={17} /><span>{item.label}</span></button> })}
                </div>
              </section>

              <section class="merge-control-section merge-source-section">
                <div class="section-heading"><span>图片与层级</span>{selectedIndex >= 0 && <button type="button" class="text-button" onClick={() => removeSource(selectedIndex)}>移除</button>}</div>
                <div class="merge-source-list">
                  {sources.map((source, index) => <button type="button" key={source.id} class={selectedId === source.id ? 'merge-source-thumb active' : 'merge-source-thumb'} onClick={() => setSelectedId(source.id)}><img src={source.url} alt="" /><span>{index + 1}</span></button>)}
                  <button type="button" class="merge-source-thumb add" onClick={() => fileInput.current?.click()} aria-label="继续添加图片"><Plus size={19} /></button>
                </div>
                <div class="merge-layer-actions">
                  <button type="button" onClick={() => moveLayer(-1)} disabled={selectedIndex <= 0}><ArrowDownToLine size={15} />下移</button>
                  <button type="button" onClick={() => moveLayer(1)} disabled={selectedIndex < 0 || selectedIndex >= sources.length - 1}><ArrowUpToLine size={15} />上移</button>
                  <button type="button" class="danger" onClick={() => removeSource(selectedIndex)} disabled={selectedIndex < 0}><Trash2 size={15} />删除</button>
                </div>
              </section>

              {replacePageCount > 0 && <label class="toggle-field merge-keep-toggle"><span><strong>保留原页面</strong><small>关闭后将用拼合页替换这 {replacePageCount} 页</small></span><input type="checkbox" checked={keepOriginals} onChange={(event) => setKeepOriginals((event.currentTarget as HTMLInputElement).checked)} /></label>}
            </div>
            <button type="button" class="primary-button merge-confirm" onClick={() => onConfirm({ sources, placements, aspectRatio, keepOriginals })} disabled={busy || loading || sources.length < 2}><Combine size={17} />{loading ? '正在读取图片' : '拼合并进入扫描编辑'}</button>
          </aside>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { const input = event.currentTarget as HTMLInputElement; if (input.files) void addFiles(input.files); input.value = '' }} />
      </section>
    </div>
  )
}
