import { loadImage } from './imageEngine'

export type CompositionMode = 'vertical' | 'horizontal' | 'grid'

export interface CompositionSource {
  url: string
  width: number
  height: number
}

export interface CompositionPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface CompositionLayout {
  width: number
  height: number
  placements: CompositionPlacement[]
}

export interface NormalizedCompositionPlacement {
  x: number
  y: number
  width: number
  height: number
}

function scaleLayout(width: number, height: number, placements: CompositionPlacement[], maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    placements: placements.map((item) => ({
      x: item.x * scale,
      y: item.y * scale,
      width: item.width * scale,
      height: item.height * scale,
    })),
  }
}

export function calculateCompositionLayout(
  sources: Pick<CompositionSource, 'width' | 'height'>[],
  mode: CompositionMode,
  gap = 24,
  maxDimension = 8192,
): CompositionLayout {
  if (sources.length === 0) throw new Error('合并图片至少需要一页。')
  const placements: CompositionPlacement[] = []

  if (mode === 'vertical') {
    const contentWidth = Math.max(...sources.map((source) => source.width))
    let y = gap
    sources.forEach((source) => {
      const height = source.height * (contentWidth / source.width)
      placements.push({ x: gap, y, width: contentWidth, height })
      y += height + gap
    })
    return scaleLayout(contentWidth + gap * 2, y, placements, maxDimension)
  }

  if (mode === 'horizontal') {
    const contentHeight = Math.max(...sources.map((source) => source.height))
    let x = gap
    sources.forEach((source) => {
      const width = source.width * (contentHeight / source.height)
      placements.push({ x, y: gap, width, height: contentHeight })
      x += width + gap
    })
    return scaleLayout(x, contentHeight + gap * 2, placements, maxDimension)
  }

  const columns = sources.length === 1 ? 1 : 2
  const cellWidth = Math.max(...sources.map((source) => source.width))
  let y = gap
  for (let row = 0; row < Math.ceil(sources.length / columns); row += 1) {
    const rowSources = sources.slice(row * columns, row * columns + columns)
    const heights = rowSources.map((source) => source.height * (cellWidth / source.width))
    const rowHeight = Math.max(...heights)
    rowSources.forEach((source, column) => {
      const height = source.height * (cellWidth / source.width)
      placements.push({
        x: gap + column * (cellWidth + gap),
        y: y + (rowHeight - height) / 2,
        width: cellWidth,
        height,
      })
    })
    y += rowHeight + gap
  }
  return scaleLayout(columns * cellWidth + (columns + 1) * gap, y, placements, maxDimension)
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('生成合并图片失败。'))), 'image/jpeg', quality)
  })
}

export async function composeScans(sources: CompositionSource[], mode: CompositionMode, quality = 0.9) {
  const layout = calculateCompositionLayout(sources, mode)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备不支持图片合并。')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const images = await Promise.all(sources.map((source) => loadImage(source.url)))
  images.forEach((image, index) => {
    const placement = layout.placements[index]
    context.drawImage(image, placement.x, placement.y, placement.width, placement.height)
  })
  return { blob: await canvasToBlob(canvas, quality), width: canvas.width, height: canvas.height }
}

export function calculateFreeformCanvasSize(aspectRatio: number, maxDimension = 4096) {
  const ratio = Math.max(0.24, Math.min(4.2, aspectRatio))
  return ratio >= 1
    ? { width: maxDimension, height: Math.max(1, Math.round(maxDimension / ratio)) }
    : { width: Math.max(1, Math.round(maxDimension * ratio)), height: maxDimension }
}

export async function composePlacedScans(
  sources: CompositionSource[],
  placements: NormalizedCompositionPlacement[],
  aspectRatio: number,
  quality = 0.92,
  maxDimension = 4096,
) {
  if (sources.length === 0 || sources.length !== placements.length) {
    throw new Error('拼图内容与位置不完整。')
  }
  const size = calculateFreeformCanvasSize(aspectRatio, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备不支持图片拼合。')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const images = await Promise.all(sources.map((source) => loadImage(source.url)))
  images.forEach((image, index) => {
    const placement = placements[index]
    context.drawImage(
      image,
      placement.x * canvas.width,
      placement.y * canvas.height,
      placement.width * canvas.width,
      placement.height * canvas.height,
    )
  })
  return { blob: await canvasToBlob(canvas, quality), width: canvas.width, height: canvas.height }
}
