import { useEffect, useRef } from 'preact/hooks'
import type { CornerSet, Point } from '../core/geometry'
import { clampCorners } from '../core/geometry'
import { loadImage } from '../core/imageEngine'

interface CropCanvasProps {
  imageUrl: string
  corners: CornerSet
  onChange: (corners: CornerSet) => void
  onEditStart?: () => void
  onEditEnd?: () => void
}

interface Layout {
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
  width: number
  height: number
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function CropCanvas({ imageUrl, corners, onChange, onEditStart, onEditEnd }: CropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeHandle = useRef<number | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const cornersRef = useRef(corners)
  cornersRef.current = corners

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    const paint = async () => {
      const image = await loadImage(imageUrl)
      if (disposed || !canvasRef.current || !containerRef.current) return
      const canvas = canvasRef.current
      const bounds = containerRef.current.getBoundingClientRect()
      const ratio = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight)
      const imageWidth = image.naturalWidth * ratio
      const imageHeight = image.naturalHeight * ratio
      const layout: Layout = {
        imageX: (bounds.width - imageWidth) / 2,
        imageY: (bounds.height - imageHeight) / 2,
        imageWidth,
        imageHeight,
        width: bounds.width,
        height: bounds.height,
      }
      layoutRef.current = layout
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(bounds.width * dpr))
      canvas.height = Math.max(1, Math.round(bounds.height * dpr))
      canvas.style.width = `${bounds.width}px`
      canvas.style.height = `${bounds.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.fillStyle = '#151619'
      context.fillRect(0, 0, bounds.width, bounds.height)
      context.drawImage(image, layout.imageX, layout.imageY, layout.imageWidth, layout.imageHeight)
      const points = cornersRef.current.map((point) => ({
        x: layout.imageX + point.x * layout.imageWidth,
        y: layout.imageY + point.y * layout.imageHeight,
      }))
      context.save()
      context.fillStyle = 'rgba(10, 11, 14, 0.58)'
      context.fillRect(0, 0, bounds.width, bounds.height)
      context.globalCompositeOperation = 'destination-out'
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.fill()
      context.restore()
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.strokeStyle = '#0a84ff'
      context.lineWidth = 2
      context.shadowColor = 'rgba(0,0,0,.45)'
      context.shadowBlur = 5
      context.stroke()
      context.shadowBlur = 0
      points.forEach((point) => {
        context.beginPath()
        context.arc(point.x, point.y, 14, 0, Math.PI * 2)
        context.fillStyle = 'rgba(10,132,255,.18)'
        context.fill()
        context.beginPath()
        context.arc(point.x, point.y, 7, 0, Math.PI * 2)
        context.fillStyle = '#0a84ff'
        context.fill()
        context.strokeStyle = '#fff'
        context.lineWidth = 2
        context.stroke()
      })
    }

    void paint()
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => void paint())
      resizeObserver.observe(containerRef.current)
    }
    return () => {
      disposed = true
      resizeObserver?.disconnect()
    }
  }, [imageUrl, corners])

  const pointerToPoint = (event: PointerEvent) => {
    const layout = layoutRef.current
    if (!layout) return null
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left - layout.imageX) / layout.imageWidth)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top - layout.imageY) / layout.imageHeight)),
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    const layout = layoutRef.current
    if (!layout || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const handles = corners.map((corner) => ({
      x: layout.imageX + corner.x * layout.imageWidth,
      y: layout.imageY + corner.y * layout.imageHeight,
    }))
    const nearest = handles.reduce<{ index: number; distance: number } | null>((best, handle, index) => {
      const nextDistance = distance(screenPoint, handle)
      return nextDistance < (best?.distance ?? 34) ? { index, distance: nextDistance } : best
    }, null)
    if (!nearest) return
    activeHandle.current = nearest.index
    canvasRef.current.setPointerCapture(event.pointerId)
    onEditStart?.()
    navigator.vibrate?.(8)
  }

  const onPointerMove = (event: PointerEvent) => {
    const index = activeHandle.current
    if (index === null) return
    const point = pointerToPoint(event)
    if (!point) return
    const next = cornersRef.current.map((corner) => ({ ...corner })) as CornerSet
    next[index] = point
    onChange(clampCorners(next))
  }

  const onPointerUp = (event: PointerEvent) => {
    const wasEditing = activeHandle.current !== null
    activeHandle.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    if (wasEditing) onEditEnd?.()
  }

  return (
    <div ref={containerRef} class="crop-canvas-wrap">
      <canvas
        ref={canvasRef}
        class="crop-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="拖动四角调整扫描范围"
      />
    </div>
  )
}
