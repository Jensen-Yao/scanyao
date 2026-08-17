import {
  DEFAULT_CORNERS,
  calculateWarpSize,
  projectUnitPoint,
  quadrilateralArea,
  type CornerSet,
} from './geometry'

export type FilterId = 'original' | 'clean' | 'enhance' | 'grayscale' | 'bw'

export interface ScanResult {
  blob: Blob
  url: string
  width: number
  height: number
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(url: string) {
  const cached = imageCache.get(url)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取这张图片。'))
    image.src = url
  })
  imageCache.set(url, promise)
  return promise
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('生成扫描件失败。'))),
      'image/jpeg',
      quality,
    )
  })
}

function sample(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) {
  const boundedX = Math.max(0, Math.min(width - 1, x))
  const boundedY = Math.max(0, Math.min(height - 1, y))
  const x0 = Math.floor(boundedX)
  const y0 = Math.floor(boundedY)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const weightX = boundedX - x0
  const weightY = boundedY - y0
  const top = source[(y0 * width + x0) * 4 + channel] * (1 - weightX) + source[(y0 * width + x1) * 4 + channel] * weightX
  const bottom = source[(y1 * width + x0) * 4 + channel] * (1 - weightX) + source[(y1 * width + x1) * 4 + channel] * weightX
  return top * (1 - weightY) + bottom * weightY
}

function mix(original: number, filtered: number, strength: number) {
  return Math.max(0, Math.min(255, original + (filtered - original) * strength))
}

function applyFilter(data: Uint8ClampedArray, filter: FilterId, strength: number) {
  if (filter === 'original' || strength <= 0) return

  let low = 0
  let high = 255
  if (filter === 'clean') {
    const histogram = new Uint32Array(256)
    for (let index = 0; index < data.length; index += 4) {
      histogram[Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114)] += 1
    }
    const pixelCount = data.length / 4
    const lowerTarget = pixelCount * 0.015
    const upperTarget = pixelCount * 0.985
    let cumulative = 0
    for (let value = 0; value < 256; value += 1) {
      cumulative += histogram[value]
      if (cumulative <= lowerTarget) low = value
      if (cumulative < upperTarget) high = value
    }
    if (high - low < 48) {
      low = 0
      high = 255
    }
  }

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    let targetRed = red
    let targetGreen = green
    let targetBlue = blue

    if (filter === 'clean') {
      const stretch = (value: number) => ((value - low) / Math.max(1, high - low)) * 255
      targetRed = stretch(red) * 1.025 + 4
      targetGreen = stretch(green) * 1.025 + 4
      targetBlue = stretch(blue) * 1.015 + 5
    } else if (filter === 'enhance') {
      const contrast = 1.42
      targetRed = (red - 128) * contrast + 132
      targetGreen = (green - 128) * contrast + 132
      targetBlue = (blue - 128) * contrast + 132
    } else if (filter === 'grayscale') {
      targetRed = luminance
      targetGreen = luminance
      targetBlue = luminance
    } else if (filter === 'bw') {
      const threshold = 162
      const value = luminance >= threshold ? 255 : 0
      targetRed = value
      targetGreen = value
      targetBlue = value
    }

    data[index] = mix(red, targetRed, strength)
    data[index + 1] = mix(green, targetGreen, strength)
    data[index + 2] = mix(blue, targetBlue, strength)
  }
}

function rotateCanvas(source: HTMLCanvasElement, rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360
  if (normalized === 0) return source

  const swapSides = normalized === 90 || normalized === 270
  const canvas = document.createElement('canvas')
  canvas.width = swapSides ? source.height : source.width
  canvas.height = swapSides ? source.width : source.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备不支持图片画布。')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalized * Math.PI) / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

export async function renderScan(
  imageUrl: string,
  corners: CornerSet,
  rotation: number,
  filter: FilterId,
  strength: number,
  maxDimension = 2400,
  quality = 0.9,
): Promise<ScanResult> {
  const image = await loadImage(imageUrl)
  const sourceScale = Math.min(1, 3600 / Math.max(image.naturalWidth, image.naturalHeight))
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * sourceScale))
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * sourceScale))
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceWidth
  sourceCanvas.height = sourceHeight
  const sourceContext = sourceCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!sourceContext) throw new Error('当前设备不支持图片画布。')
  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight)
  const sourceData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data
  const outputSize = calculateWarpSize(corners, sourceWidth, sourceHeight, maxDimension)
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = outputSize.width
  outputCanvas.height = outputSize.height
  const outputContext = outputCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!outputContext) throw new Error('当前设备不支持图片画布。')
  const outputData = outputContext.createImageData(outputSize.width, outputSize.height)
  const pixels = outputData.data

  for (let y = 0; y < outputSize.height; y += 1) {
    const v = outputSize.height === 1 ? 0 : y / (outputSize.height - 1)
    for (let x = 0; x < outputSize.width; x += 1) {
      const u = outputSize.width === 1 ? 0 : x / (outputSize.width - 1)
      const point = projectUnitPoint(corners, u, v)
      const sourceX = point.x * (sourceWidth - 1)
      const sourceY = point.y * (sourceHeight - 1)
      const outputIndex = (y * outputSize.width + x) * 4
      pixels[outputIndex] = sample(sourceData, sourceWidth, sourceHeight, sourceX, sourceY, 0)
      pixels[outputIndex + 1] = sample(sourceData, sourceWidth, sourceHeight, sourceX, sourceY, 1)
      pixels[outputIndex + 2] = sample(sourceData, sourceWidth, sourceHeight, sourceX, sourceY, 2)
      pixels[outputIndex + 3] = 255
    }
  }

  applyFilter(pixels, filter, Math.min(1, Math.max(0, strength)))
  outputContext.putImageData(outputData, 0, 0)
  const finalCanvas = rotateCanvas(outputCanvas, rotation)
  const blob = await canvasToBlob(finalCanvas, quality)
  return {
    blob,
    url: URL.createObjectURL(blob),
    width: finalCanvas.width,
    height: finalCanvas.height,
  }
}

export async function detectDocumentCorners(imageUrl: string): Promise<CornerSet> {
  const image = await loadImage(imageUrl)
  const scale = Math.min(1, 440 / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(8, Math.round(image.naturalWidth * scale))
  const height = Math.max(8, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return DEFAULT_CORNERS.map((point) => ({ ...point })) as CornerSet
  context.drawImage(image, 0, 0, width, height)
  const rgba = context.getImageData(0, 0, width, height).data
  const grayscale = new Uint8Array(width * height)
  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4
    grayscale[index] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114)
  }

  const magnitudes = new Uint8Array(width * height)
  const histogram = new Uint32Array(256)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = grayscale[(y - 1) * width + x - 1]
      const top = grayscale[(y - 1) * width + x]
      const topRight = grayscale[(y - 1) * width + x + 1]
      const left = grayscale[y * width + x - 1]
      const right = grayscale[y * width + x + 1]
      const bottomLeft = grayscale[(y + 1) * width + x - 1]
      const bottom = grayscale[(y + 1) * width + x]
      const bottomRight = grayscale[(y + 1) * width + x + 1]
      const gradientX = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight
      const gradientY = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
      const magnitude = Math.min(255, Math.round(Math.hypot(gradientX, gradientY) / 4))
      magnitudes[y * width + x] = magnitude
      histogram[magnitude] += 1
    }
  }

  const target = width * height * 0.86
  let cumulative = 0
  let threshold = 96
  for (let value = 0; value < 256; value += 1) {
    cumulative += histogram[value]
    if (cumulative >= target) {
      threshold = Math.max(54, value)
      break
    }
  }

  const insetX = Math.max(2, Math.round(width * 0.025))
  const insetY = Math.max(2, Math.round(height * 0.025))
  let topLeft = { x: width, y: height, score: Number.POSITIVE_INFINITY }
  let topRight = { x: 0, y: height, score: Number.NEGATIVE_INFINITY }
  let bottomRight = { x: 0, y: 0, score: Number.NEGATIVE_INFINITY }
  let bottomLeft = { x: width, y: 0, score: Number.POSITIVE_INFINITY }

  for (let y = insetY; y < height - insetY; y += 1) {
    for (let x = insetX; x < width - insetX; x += 1) {
      if (magnitudes[y * width + x] < threshold) continue
      const sum = x + y
      const difference = x - y
      if (sum < topLeft.score) topLeft = { x, y, score: sum }
      if (difference > topRight.score) topRight = { x, y, score: difference }
      if (sum > bottomRight.score) bottomRight = { x, y, score: sum }
      if (difference < bottomLeft.score) bottomLeft = { x, y, score: difference }
    }
  }

  const detected: CornerSet = [topLeft, topRight, bottomRight, bottomLeft].map((point) => ({
    x: point.x / width,
    y: point.y / height,
  })) as CornerSet

  if (quadrilateralArea(detected) < 0.22 || detected.some((point) => !Number.isFinite(point.x + point.y))) {
    return DEFAULT_CORNERS.map((point) => ({ ...point })) as CornerSet
  }
  return detected
}
