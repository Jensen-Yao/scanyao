import {
  DEFAULT_CORNERS,
  calculateWarpSize,
  projectUnitPoint,
  quadrilateralArea,
  type CornerSet,
} from './geometry'

export type FilterId = 'auto' | 'original' | 'clean' | 'text' | 'enhance' | 'color' | 'photo' | 'whiteboard' | 'shadow' | 'receipt' | 'invoice' | 'book' | 'newspaper' | 'notes' | 'card' | 'id' | 'certificate' | 'stamp' | 'blueprint' | 'screen' | 'grayscale' | 'bw'

export const DEFAULT_FILTER_STRENGTHS: Record<FilterId, number> = {
  auto: 0.88,
  original: 0,
  clean: 0.86,
  text: 0.88,
  enhance: 0.78,
  color: 0.76,
  photo: 0.62,
  whiteboard: 0.9,
  shadow: 0.86,
  receipt: 0.9,
  invoice: 0.88,
  book: 0.84,
  newspaper: 0.88,
  notes: 0.84,
  card: 0.78,
  id: 0.6,
  certificate: 0.7,
  stamp: 0.88,
  blueprint: 0.86,
  screen: 0.58,
  grayscale: 0.9,
  bw: 1,
}

export interface ScanAdjustments {
  brightness: number
  contrast: number
  sharpen: number
  threshold: number
}

export const DEFAULT_ADJUSTMENTS: ScanAdjustments = {
  brightness: 0,
  contrast: 0,
  sharpen: 0.18,
  threshold: 0.52,
}

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

interface BackgroundGrid {
  blockSize: number
  width: number
  height: number
  values: Float32Array
}

function buildBackgroundGrid(data: Uint8ClampedArray, width: number, height: number, blockSize = 32): BackgroundGrid {
  const gridWidth = Math.ceil(width / blockSize)
  const gridHeight = Math.ceil(height / blockSize)
  const sums = new Float64Array(gridWidth * gridHeight)
  const counts = new Uint32Array(gridWidth * gridHeight)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4
      const cell = Math.floor(y / blockSize) * gridWidth + Math.floor(x / blockSize)
      sums[cell] += data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114
      counts[cell] += 1
    }
  }
  const averages = new Float32Array(sums.length)
  averages.forEach((_, index) => { averages[index] = sums[index] / Math.max(1, counts[index]) })
  const values = new Float32Array(averages.length)
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      let brightest = 0
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(gridWidth - 1, x + offsetX))
          const sampleY = Math.max(0, Math.min(gridHeight - 1, y + offsetY))
          brightest = Math.max(brightest, averages[sampleY * gridWidth + sampleX])
        }
      }
      values[y * gridWidth + x] = brightest
    }
  }
  return { blockSize, width: gridWidth, height: gridHeight, values }
}

function sampleBackground(grid: BackgroundGrid, x: number, y: number) {
  const gridX = Math.max(0, Math.min(grid.width - 1, x / grid.blockSize))
  const gridY = Math.max(0, Math.min(grid.height - 1, y / grid.blockSize))
  const x0 = Math.floor(gridX)
  const y0 = Math.floor(gridY)
  const x1 = Math.min(grid.width - 1, x0 + 1)
  const y1 = Math.min(grid.height - 1, y0 + 1)
  const weightX = gridX - x0
  const weightY = gridY - y0
  const top = grid.values[y0 * grid.width + x0] * (1 - weightX) + grid.values[y0 * grid.width + x1] * weightX
  const bottom = grid.values[y1 * grid.width + x0] * (1 - weightX) + grid.values[y1 * grid.width + x1] * weightX
  return top * (1 - weightY) + bottom * weightY
}

function chooseAutoFilter(data: Uint8ClampedArray): Exclude<FilterId, 'auto'> {
  let luminanceTotal = 0
  let saturationTotal = 0
  let brightPixels = 0
  let darkPixels = 0
  let samples = 0
  for (let index = 0; index < data.length; index += 64) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    luminanceTotal += luminance
    saturationTotal += Math.max(red, green, blue) - Math.min(red, green, blue)
    if (luminance > 215) brightPixels += 1
    if (luminance < 105) darkPixels += 1
    samples += 1
  }
  const saturation = saturationTotal / Math.max(1, samples)
  const brightness = luminanceTotal / Math.max(1, samples)
  if (saturation > 34) return 'color'
  if (darkPixels / Math.max(1, samples) > 0.28 || brightness < 155) return 'shadow'
  if (brightPixels / Math.max(1, samples) > 0.62 && saturation < 15) return 'receipt'
  return 'clean'
}

export function processPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  filter: FilterId,
  strength: number,
  adjustments: ScanAdjustments,
) {
  const effectiveFilter = filter === 'auto' ? chooseAutoFilter(data) : filter
  let low = 0
  let high = 255
  if (effectiveFilter === 'clean') {
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

  const filterStrength = Math.min(1, Math.max(0, strength))
  const brightness = Math.min(1, Math.max(-1, adjustments.brightness)) * 72
  const contrast = Math.min(1, Math.max(-1, adjustments.contrast))
  const contrastFactor = contrast >= 0 ? 1 + contrast * 1.6 : 1 + contrast * 0.75
  const threshold = 104 + Math.min(1, Math.max(0, adjustments.threshold)) * 112
  const backgroundGrid = ['whiteboard', 'shadow', 'receipt', 'invoice', 'book', 'newspaper', 'notes', 'certificate', 'stamp', 'blueprint'].includes(effectiveFilter)
    ? buildBackgroundGrid(data, width, height)
    : null

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    const pixelIndex = index / 4
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    let targetRed = red
    let targetGreen = green
    let targetBlue = blue

    if (effectiveFilter === 'clean') {
      const stretch = (value: number) => ((value - low) / Math.max(1, high - low)) * 255
      targetRed = stretch(red) * 1.025 + 4
      targetGreen = stretch(green) * 1.025 + 4
      targetBlue = stretch(blue) * 1.015 + 5
    } else if (effectiveFilter === 'text') {
      const value = (luminance - 128) * 1.5 + 142
      targetRed = value
      targetGreen = value
      targetBlue = value
    } else if (effectiveFilter === 'enhance') {
      const contrast = 1.42
      targetRed = (red - 128) * contrast + 132
      targetGreen = (green - 128) * contrast + 132
      targetBlue = (blue - 128) * contrast + 132
    } else if (effectiveFilter === 'color') {
      const saturation = 1.32
      const colorContrast = 1.14
      targetRed = (luminance + (red - luminance) * saturation - 128) * colorContrast + 130
      targetGreen = (luminance + (green - luminance) * saturation - 128) * colorContrast + 130
      targetBlue = (luminance + (blue - luminance) * saturation - 128) * colorContrast + 130
    } else if (effectiveFilter === 'photo') {
      const saturation = 1.12
      const photoContrast = 1.06
      targetRed = (luminance + (red - luminance) * saturation - 128) * photoContrast + 132
      targetGreen = (luminance + (green - luminance) * saturation - 128) * photoContrast + 132
      targetBlue = (luminance + (blue - luminance) * saturation - 128) * photoContrast + 132
    } else if (effectiveFilter === 'whiteboard' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalize = 242 / background
      targetRed = (red * normalize - 128) * 1.12 + 142
      targetGreen = (green * normalize - 128) * 1.12 + 142
      targetBlue = (blue * normalize - 128) * 1.12 + 142
    } else if (effectiveFilter === 'shadow' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalize = 232 / background
      targetRed = (red * normalize - 128) * 1.08 + 136
      targetGreen = (green * normalize - 128) * 1.08 + 136
      targetBlue = (blue * normalize - 128) * 1.08 + 136
    } else if (effectiveFilter === 'receipt' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalized = luminance * (242 / background)
      const value = (normalized - 128) * 1.65 + 148
      targetRed = value
      targetGreen = value
      targetBlue = value
    } else if (effectiveFilter === 'invoice' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalize = 242 / background
      const normalizedRed = red * normalize
      const normalizedGreen = green * normalize
      const normalizedBlue = blue * normalize
      const normalizedLuminance = normalizedRed * 0.299 + normalizedGreen * 0.587 + normalizedBlue * 0.114
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
      if (chroma > 16) {
        targetRed = normalizedLuminance + (normalizedRed - normalizedLuminance) * 1.42
        targetGreen = normalizedLuminance + (normalizedGreen - normalizedLuminance) * 1.42
        targetBlue = normalizedLuminance + (normalizedBlue - normalizedLuminance) * 1.42
      } else {
        const value = (normalizedLuminance - 128) * 1.5 + 146
        targetRed = value
        targetGreen = value
        targetBlue = value
      }
    } else if (effectiveFilter === 'book' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalized = luminance * (238 / background)
      const value = (normalized - 128) * 1.34 + 142
      targetRed = value + 4
      targetGreen = value + 2
      targetBlue = value - 2
    } else if (effectiveFilter === 'newspaper' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalized = luminance * (240 / background)
      const value = (normalized - 128) * 1.48 + 145
      targetRed = value
      targetGreen = value
      targetBlue = value
    } else if (effectiveFilter === 'notes' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalize = 244 / background
      const normalizedRed = red * normalize
      const normalizedGreen = green * normalize
      const normalizedBlue = blue * normalize
      const normalizedLuminance = normalizedRed * 0.299 + normalizedGreen * 0.587 + normalizedBlue * 0.114
      targetRed = normalizedLuminance + (normalizedRed - normalizedLuminance) * 1.34
      targetGreen = normalizedLuminance + (normalizedGreen - normalizedLuminance) * 1.34
      targetBlue = normalizedLuminance + (normalizedBlue - normalizedLuminance) * 1.34
    } else if (effectiveFilter === 'card') {
      const saturation = 1.2
      const cardContrast = 1.28
      targetRed = (luminance + (red - luminance) * saturation - 128) * cardContrast + 132
      targetGreen = (luminance + (green - luminance) * saturation - 128) * cardContrast + 132
      targetBlue = (luminance + (blue - luminance) * saturation - 128) * cardContrast + 132
    } else if (effectiveFilter === 'id') {
      const saturation = 1.08
      const idContrast = 1.06
      targetRed = (luminance + (red - luminance) * saturation - 128) * idContrast + 130
      targetGreen = (luminance + (green - luminance) * saturation - 128) * idContrast + 130
      targetBlue = (luminance + (blue - luminance) * saturation - 128) * idContrast + 130
    } else if (effectiveFilter === 'certificate' && backgroundGrid) {
      const background = Math.max(84, sampleBackground(backgroundGrid, x, y))
      const normalize = 234 / background
      const normalizedRed = red * normalize
      const normalizedGreen = green * normalize
      const normalizedBlue = blue * normalize
      const normalizedLuminance = normalizedRed * 0.299 + normalizedGreen * 0.587 + normalizedBlue * 0.114
      targetRed = normalizedLuminance + (normalizedRed - normalizedLuminance) * 1.24
      targetGreen = normalizedLuminance + (normalizedGreen - normalizedLuminance) * 1.24
      targetBlue = normalizedLuminance + (normalizedBlue - normalizedLuminance) * 1.24
    } else if (effectiveFilter === 'stamp' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalize = 240 / background
      const normalizedRed = red * normalize
      const normalizedGreen = green * normalize
      const normalizedBlue = blue * normalize
      const normalizedLuminance = normalizedRed * 0.299 + normalizedGreen * 0.587 + normalizedBlue * 0.114
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
      if (chroma > 18) {
        const saturation = 1.62
        targetRed = normalizedLuminance + (normalizedRed - normalizedLuminance) * saturation
        targetGreen = normalizedLuminance + (normalizedGreen - normalizedLuminance) * saturation
        targetBlue = normalizedLuminance + (normalizedBlue - normalizedLuminance) * saturation
      } else {
        const value = (normalizedLuminance - 128) * 1.38 + 145
        targetRed = value
        targetGreen = value
        targetBlue = value
      }
    } else if (effectiveFilter === 'blueprint' && backgroundGrid) {
      const background = Math.max(72, sampleBackground(backgroundGrid, x, y))
      const normalized = luminance * (240 / background)
      const blueDominance = Math.max(0, blue - (red + green) / 2)
      const value = (normalized - 128) * 1.4 + 142 - blueDominance * 1.35
      targetRed = value
      targetGreen = value
      targetBlue = value
    } else if (effectiveFilter === 'screen') {
      const saturation = 1.04
      targetRed = (luminance + (red - luminance) * saturation - 128) * 1.04 + 130
      targetGreen = (luminance + (green - luminance) * saturation - 128) * 1.04 + 130
      targetBlue = (luminance + (blue - luminance) * saturation - 128) * 1.04 + 130
    } else if (effectiveFilter === 'grayscale') {
      targetRed = luminance
      targetGreen = luminance
      targetBlue = luminance
    } else if (effectiveFilter === 'bw') {
      const value = luminance >= threshold ? 255 : 0
      targetRed = value
      targetGreen = value
      targetBlue = value
    }

    const adjustedRed = (mix(red, targetRed, filterStrength) - 128) * contrastFactor + 128 + brightness
    const adjustedGreen = (mix(green, targetGreen, filterStrength) - 128) * contrastFactor + 128 + brightness
    const adjustedBlue = (mix(blue, targetBlue, filterStrength) - 128) * contrastFactor + 128 + brightness
    data[index] = Math.max(0, Math.min(255, adjustedRed))
    data[index + 1] = Math.max(0, Math.min(255, adjustedGreen))
    data[index + 2] = Math.max(0, Math.min(255, adjustedBlue))
  }

  if (effectiveFilter === 'screen' && width > 2 && height > 2) {
    const source = new Uint8ClampedArray(data)
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4
        for (let channel = 0; channel < 3; channel += 1) {
          const neighbors = source[index - 4 + channel] + source[index + 4 + channel]
            + source[index - width * 4 + channel] + source[index + width * 4 + channel]
          data[index + channel] = source[index + channel] * 0.68 + neighbors * 0.08
        }
      }
    }
  }

  const presetSharpen = ['receipt', 'invoice', 'card', 'text'].includes(effectiveFilter) ? 0.12 : ['book', 'newspaper', 'notes'].includes(effectiveFilter) ? 0.07 : 0
  const sharpen = Math.min(1, Math.max(0, adjustments.sharpen + presetSharpen)) * 0.42
  if (sharpen <= 0 || width < 3 || height < 3) return
  const source = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel]
        const neighbors = source[index - 4 + channel]
          + source[index + 4 + channel]
          + source[index - width * 4 + channel]
          + source[index + width * 4 + channel]
        data[index + channel] = Math.max(0, Math.min(255, center + (center * 4 - neighbors) * sharpen))
      }
    }
  }
}

function transformCanvas(source: HTMLCanvasElement, rotation: number, flipX: boolean, flipY: boolean) {
  const normalized = ((rotation % 360) + 360) % 360
  if (normalized === 0 && !flipX && !flipY) return source

  const swapSides = normalized === 90 || normalized === 270
  const canvas = document.createElement('canvas')
  canvas.width = swapSides ? source.height : source.width
  canvas.height = swapSides ? source.width : source.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备不支持图片画布。')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
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
  adjustments: ScanAdjustments = DEFAULT_ADJUSTMENTS,
  flipX = false,
  flipY = false,
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

  processPixels(pixels, outputSize.width, outputSize.height, filter, strength, adjustments)
  outputContext.putImageData(outputData, 0, 0)
  const finalCanvas = transformCanvas(outputCanvas, rotation, flipX, flipY)
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
