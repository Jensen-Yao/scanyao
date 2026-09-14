import { useEffect, useRef, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight, Eye, X, ZoomIn, ZoomOut } from 'lucide-preact'

interface PreviewOverlayProps {
  processedUrl: string
  originalUrl: string
  caption: string
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

interface Transform {
  scale: number
  x: number
  y: number
}

const MIN_SCALE = 1
const MAX_SCALE = 6

function clampTransform(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 全屏扫描件预览：滚轮/双指缩放、拖动平移、双击放大、
 * 按住“对比原图”查看未处理照片，并支持左右翻页。
 */
export function PreviewOverlay({
  processedUrl,
  originalUrl,
  caption,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClose,
}: PreviewOverlayProps) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const [showOriginal, setShowOriginal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | null>(null)
  const pan = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null)
  const transformRef = useRef(transform)
  transformRef.current = transform

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 })
    setShowOriginal(false)
  }, [processedUrl])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft' && canPrev) onPrev()
      else if (event.key === 'ArrowRight' && canNext) onNext()
      else if (event.key === '+' || event.key === '=') setTransform((current) => ({ ...current, scale: clampTransform(current.scale * 1.25, MIN_SCALE, MAX_SCALE) }))
      else if (event.key === '-') setTransform((current) => ({ ...current, scale: clampTransform(current.scale / 1.25, MIN_SCALE, MAX_SCALE) }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canNext, canPrev, onClose, onNext, onPrev])

  const zoomAt = (factor: number, origin?: { x: number; y: number }) => {
    setTransform((current) => {
      const nextScale = clampTransform(current.scale * factor, MIN_SCALE, MAX_SCALE)
      const applied = nextScale / current.scale
      const bounds = containerRef.current?.getBoundingClientRect()
      const originX = origin && bounds ? origin.x - bounds.left - bounds.width / 2 : 0
      const originY = origin && bounds ? origin.y - bounds.top - bounds.height / 2 : 0
      return {
        scale: nextScale,
        x: originX + (current.x - originX) * applied,
        y: originY + (current.y - originY) * applied,
      }
    })
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    zoomAt(event.deltaY < 0 ? 1.16 : 1 / 1.16, { x: event.clientX, y: event.clientY })
  }

  const syncPointers = (event: PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), scale: transformRef.current.scale }
      pan.current = null
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    syncPointers(event)
    if (pointers.current.size === 1) {
      pan.current = { x: event.clientX, y: event.clientY, baseX: transformRef.current.x, baseY: transformRef.current.y }
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return
    syncPointers(event)
    if (pointers.current.size >= 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      const factor = distance / Math.max(1, pinch.current.distance)
      const bounds = containerRef.current?.getBoundingClientRect()
      if (bounds) {
        zoomAt(factor, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 })
        pinch.current = { distance, scale: transformRef.current.scale }
      }
      return
    }
    if (pan.current) {
      setTransform((current) => {
        const limit = 240 * current.scale
        return {
          scale: current.scale,
          x: clampTransform(pan.current!.baseX + (event.clientX - pan.current!.x), -limit, limit),
          y: clampTransform(pan.current!.baseY + (event.clientY - pan.current!.y), -limit, limit),
        }
      })
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()]
      pan.current = { x: only.x, y: only.y, baseX: transformRef.current.x, baseY: transformRef.current.y }
    } else if (pointers.current.size === 0) {
      pan.current = null
    }
  }

  const onDoubleClick = (event: MouseEvent) => {
    if (transformRef.current.scale > 1.05) setTransform({ scale: 1, x: 0, y: 0 })
    else zoomAt(2.4, { x: event.clientX, y: event.clientY })
  }

  return (
    <div class="preview-overlay" role="dialog" aria-modal="true" aria-label="全屏扫描预览">
      <header class="preview-header">
        <span class="preview-caption">{caption}</span>
        <div class="preview-header-actions">
          <button
            type="button"
            class={showOriginal ? 'preview-tool active' : 'preview-tool'}
            onPointerDown={() => setShowOriginal(true)}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
            aria-label="按住对比原图"
            title="按住查看原图"
          ><Eye size={16} /><span>对比原图</span></button>
          <button type="button" class="preview-tool" onClick={() => zoomAt(1 / 1.4)} aria-label="缩小"><ZoomOut size={16} /></button>
          <button type="button" class="preview-tool" onClick={() => zoomAt(1.4)} aria-label="放大"><ZoomIn size={16} /></button>
          <button type="button" class="preview-tool" onClick={onClose} aria-label="关闭全屏预览"><X size={17} /></button>
        </div>
      </header>
      <div
        ref={containerRef}
        class="preview-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDblClick={onDoubleClick}
      >
        <img
          class="preview-image"
          style={`transform: translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`}
          src={showOriginal ? originalUrl : processedUrl}
          alt={showOriginal ? '未处理的原图' : '扫描结果预览'}
          draggable={false}
        />
        {showOriginal && <span class="preview-original-tag">原图</span>}
      </div>
      {canPrev && <button type="button" class="preview-nav left" onClick={onPrev} aria-label="上一页"><ChevronLeft size={22} /></button>}
      {canNext && <button type="button" class="preview-nav right" onClick={onNext} aria-label="下一页"><ChevronRight size={22} /></button>}
    </div>
  )
}
