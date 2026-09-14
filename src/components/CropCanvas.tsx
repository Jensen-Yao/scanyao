import { useEffect, useRef } from 'preact/hooks'
import type { CornerSet, Point } from '../core/geometry'
import { clampCorners, dragQuadEdge, pointInQuad, quadEdgeMidpoint, translateQuad } from '../core/geometry'
import { loadImage } from '../core/imageEngine'

interface CropCanvasProps {
  imageUrl: string
  corners: CornerSet
  zoom?: number
  pan?: Point
  onChange: (corners: CornerSet) => void
  onPan?: (deltaX: number, deltaY: number) => void
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

type DragTarget = { kind: 'corner'; index: number } | { kind: 'edge'; index: number } | { kind: 'move' } | { kind: 'pan' }

const CORNER_GRAB_RADIUS = 34
const EDGE_GRAB_RADIUS = 30
const LOUPE_RADIUS = 52
const LOUPE_ZOOM = 2.6

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function CropCanvas({ imageUrl, corners, zoom = 1, pan, onChange, onPan, onEditStart, onEditEnd }: CropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeTarget = useRef<DragTarget | null>(null)
  const lastPointer = useRef<Point | null>(null)
  const loupeAnchor = useRef<Point | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const cornersRef = useRef(corners)
  const repaintRef = useRef<() => void>(() => {})
  cornersRef.current = corners
  const panRef = useRef(pan ?? { x: 0, y: 0 })
  panRef.current = pan ?? { x: 0, y: 0 }

  useEffect(() => {
    let disposed = false

    const paint = async () => {
      const image = await loadImage(imageUrl)
      if (disposed || !canvasRef.current || !containerRef.current) return
      const canvas = canvasRef.current
      const bounds = containerRef.current.getBoundingClientRect()
      if (bounds.width < 2 || bounds.height < 2) return
      const ratio = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight) * zoom
      const imageWidth = image.naturalWidth * ratio
      const imageHeight = image.naturalHeight * ratio
      const layout: Layout = {
        imageX: (bounds.width - imageWidth) / 2 + (panRef.current.x ?? 0),
        imageY: (bounds.height - imageHeight) / 2 + (panRef.current.y ?? 0),
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

      const toScreen = (point: Point): Point => ({
        x: layout.imageX + point.x * layout.imageWidth,
        y: layout.imageY + point.y * layout.imageHeight,
      })
      const points = cornersRef.current.map(toScreen)
      const midpoints = [0, 1, 2, 3].map((edge) => toScreen(quadEdgeMidpoint(cornersRef.current, edge)))

      context.save()
      context.fillStyle = 'rgba(8, 9, 12, 0.6)'
      context.fillRect(0, 0, bounds.width, bounds.height)
      context.globalCompositeOperation = 'destination-out'
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.fill()
      context.restore()

      // 三分构图网格，帮助对齐文档边缘
      context.save()
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.clip()
      context.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      context.lineWidth = 1
      for (const fraction of [1 / 3, 2 / 3]) {
        const top = toScreen({ x: fraction, y: 0 })
        const bottom = toScreen({ x: fraction, y: 1 })
        const left = toScreen({ x: 0, y: fraction })
        const right = toScreen({ x: 1, y: fraction })
        context.beginPath()
        context.moveTo(top.x, top.y)
        context.lineTo(bottom.x, bottom.y)
        context.moveTo(left.x, left.y)
        context.lineTo(right.x, right.y)
        context.stroke()
      }
      context.restore()

      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.strokeStyle = '#0a84ff'
      context.lineWidth = 2.5
      context.shadowColor = 'rgba(0,0,0,.5)'
      context.shadowBlur = 6
      context.stroke()
      context.shadowBlur = 0

      points.forEach((point) => {
        context.beginPath()
        context.arc(point.x, point.y, 15, 0, Math.PI * 2)
        context.fillStyle = 'rgba(10,132,255,.2)'
        context.fill()
        context.beginPath()
        context.arc(point.x, point.y, 7.5, 0, Math.PI * 2)
        context.fillStyle = '#0a84ff'
        context.fill()
        context.strokeStyle = '#fff'
        context.lineWidth = 2.5
        context.stroke()
      })
      midpoints.forEach((mid) => {
        context.beginPath()
        context.arc(mid.x, mid.y, 5.5, 0, Math.PI * 2)
        context.fillStyle = 'rgba(255,255,255,.85)'
        context.fill()
        context.strokeStyle = 'rgba(10,132,255,.9)'
        context.lineWidth = 1.6
        context.stroke()
      })

      const anchor = loupeAnchor.current
      if (anchor) {
        const imagePoint = {
          x: (anchor.x - layout.imageX) / layout.imageWidth,
          y: (anchor.y - layout.imageY) / layout.imageHeight,
        }
        const sourceRadius = (LOUPE_RADIUS / LOUPE_ZOOM) * (image.naturalWidth / layout.imageWidth)
        const sourceX = Math.max(0, Math.min(Math.max(0, image.naturalWidth - sourceRadius * 2), imagePoint.x * image.naturalWidth - sourceRadius))
        const sourceY = Math.max(0, Math.min(Math.max(0, image.naturalHeight - sourceRadius * 2), imagePoint.y * image.naturalHeight - sourceRadius))
        const loupeX = anchor.x > bounds.width / 2 ? 16 + LOUPE_RADIUS : bounds.width - 16 - LOUPE_RADIUS
        const loupeY = anchor.y > bounds.height / 2 ? 16 + LOUPE_RADIUS : bounds.height - 16 - LOUPE_RADIUS
        context.save()
        context.beginPath()
        context.arc(loupeX, loupeY, LOUPE_RADIUS, 0, Math.PI * 2)
        context.closePath()
        context.fillStyle = '#0b0c0f'
        context.fill()
        context.clip()
        context.imageSmoothingEnabled = true
        try {
          context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceRadius * 2,
            sourceRadius * 2,
            loupeX - LOUPE_RADIUS,
            loupeY - LOUPE_RADIUS,
            LOUPE_RADIUS * 2,
            LOUPE_RADIUS * 2,
          )
        } catch {
          // 图片尚未解码完成时跳过放大镜内容
        }
        context.strokeStyle = 'rgba(10,132,255,.9)'
        context.lineWidth = 1.4
        context.beginPath()
        context.moveTo(loupeX - 14, loupeY)
        context.lineTo(loupeX + 14, loupeY)
        context.moveTo(loupeX, loupeY - 14)
        context.lineTo(loupeX, loupeY + 14)
        context.stroke()
        context.restore()
        context.beginPath()
        context.arc(loupeX, loupeY, LOUPE_RADIUS, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(255,255,255,.55)'
        context.lineWidth = 2
        context.stroke()
      }
    }

    repaintRef.current = () => { void paint() }
    void paint()
    const resizeObserver = new ResizeObserver(() => void paint())
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    return () => {
      disposed = true
      resizeObserver.disconnect()
    }
  }, [imageUrl, corners, zoom, pan])

  const toUnitPoint = (event: PointerEvent) => {
    const layout = layoutRef.current
    if (!layout) return null
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left - layout.imageX) / layout.imageWidth)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top - layout.imageY) / layout.imageHeight)),
    }
  }

  const hitTest = (screenPoint: Point): DragTarget | null => {
    const layout = layoutRef.current
    if (!layout) return null
    const toScreen = (point: Point): Point => ({
      x: layout.imageX + point.x * layout.imageWidth,
      y: layout.imageY + point.y * layout.imageHeight,
    })
    let bestTarget: DragTarget | null = null
    let bestGap = Number.POSITIVE_INFINITY
    for (let index = 0; index < 4; index += 1) {
      const gap = distance(screenPoint, toScreen(cornersRef.current[index]))
      if (gap < CORNER_GRAB_RADIUS && gap < bestGap) {
        bestGap = gap
        bestTarget = { kind: 'corner', index }
      }
    }
    if (bestTarget) return bestTarget
    for (let edge = 0; edge < 4; edge += 1) {
      const gap = distance(screenPoint, toScreen(quadEdgeMidpoint(cornersRef.current, edge)))
      if (gap < EDGE_GRAB_RADIUS && gap < bestGap) {
        bestGap = gap
        bestTarget = { kind: 'edge', index: edge }
      }
    }
    if (bestTarget) return bestTarget
    if (pointInQuad(cornersRef.current, {
      x: (screenPoint.x - layout.imageX) / layout.imageWidth,
      y: (screenPoint.y - layout.imageY) / layout.imageHeight,
    })) return { kind: 'move' }
    return null
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const target = hitTest(screenPoint)
    if (!target && !onPan) return
    activeTarget.current = target ?? { kind: 'pan' }
    lastPointer.current = screenPoint
    loupeAnchor.current = (target === null || target.kind === 'move' || target.kind === 'pan' || event.pointerType === 'mouse') ? null : screenPoint
    canvasRef.current.setPointerCapture(event.pointerId)
    if (activeTarget.current.kind === 'pan') {
      canvasRef.current.classList.add('panning')
      return
    }
    onEditStart?.()
    navigator.vibrate?.(8)
  }

  const onPointerMove = (event: PointerEvent) => {
    const target = activeTarget.current
    if (!target) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const screenPoint = rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null
    if (!screenPoint) return
    if (target.kind === 'pan') {
      const previous = lastPointer.current
      if (previous && onPan) onPan(screenPoint.x - previous.x, screenPoint.y - previous.y)
      lastPointer.current = screenPoint
      return
    }
    const point = toUnitPoint(event)
    if (!point) return
    const previous = lastPointer.current
    let next = cornersRef.current.map((corner) => ({ ...corner })) as CornerSet
    if (target.kind === 'corner') {
      next[target.index] = point
    } else if (target.kind === 'edge') {
      next = dragQuadEdge(next, target.index, point)
    } else if (previous) {
      const layout = layoutRef.current
      if (!layout) return
      next = translateQuad(
        next,
        (screenPoint.x - previous.x) / layout.imageWidth,
        (screenPoint.y - previous.y) / layout.imageHeight,
      )
    }
    lastPointer.current = screenPoint
    if (loupeAnchor.current) loupeAnchor.current = screenPoint
    onChange(clampCorners(next))
  }

  const onPointerUp = (event: PointerEvent) => {
    const wasEditing = activeTarget.current !== null
    const wasPanning = activeTarget.current?.kind === 'pan'
    activeTarget.current = null
    lastPointer.current = null
    canvasRef.current?.classList.remove('panning')
    if (loupeAnchor.current) {
      loupeAnchor.current = null
      repaintRef.current()
    }
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    if (wasEditing && !wasPanning) onEditEnd?.()
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
        aria-label="拖动四角或边线调整扫描范围，框内拖动整体移动，空白处拖动平移视图"
      />
    </div>
  )
}
