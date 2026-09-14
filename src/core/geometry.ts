export interface Point {
  x: number
  y: number
}

export type CornerSet = [Point, Point, Point, Point]

export const DEFAULT_CORNERS: CornerSet = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
]

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function calculateWarpSize(
  corners: CornerSet,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
) {
  const points = corners.map((point) => ({
    x: point.x * sourceWidth,
    y: point.y * sourceHeight,
  })) as CornerSet
  const width = Math.max(distance(points[0], points[1]), distance(points[3], points[2]))
  const height = Math.max(distance(points[0], points[3]), distance(points[1], points[2]))
  const scale = Math.min(1, maxDimension / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function quadrilateralArea(corners: CornerSet) {
  let area = 0
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index]
    const next = corners[(index + 1) % corners.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

export function projectUnitPoint(corners: CornerSet, u: number, v: number): Point {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  const dx1 = topRight.x - bottomRight.x
  const dx2 = bottomLeft.x - bottomRight.x
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const dy1 = topRight.y - bottomRight.y
  const dy2 = bottomLeft.y - bottomRight.y
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  const determinant = dx1 * dy2 - dx2 * dy1

  let g = 0
  let h = 0
  if (Math.abs(determinant) > 1e-8 && (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8)) {
    g = (dx3 * dy2 - dx2 * dy3) / determinant
    h = (dx1 * dy3 - dx3 * dy1) / determinant
  }

  const a = topRight.x - topLeft.x + g * topRight.x
  const b = bottomLeft.x - topLeft.x + h * bottomLeft.x
  const c = topLeft.x
  const d = topRight.y - topLeft.y + g * topRight.y
  const e = bottomLeft.y - topLeft.y + h * bottomLeft.y
  const f = topLeft.y
  const divisor = g * u + h * v + 1

  return {
    x: (a * u + b * v + c) / divisor,
    y: (d * u + e * v + f) / divisor,
  }
}

export function clampCorners(corners: CornerSet): CornerSet {
  return corners.map((point) => ({
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  })) as CornerSet
}

function pointInTriangle(point: Point, a: Point, b: Point, c: Point) {
  const sign = (p1: Point, p2: Point, p3: Point) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const first = sign(point, a, b)
  const second = sign(point, b, c)
  const third = sign(point, c, a)
  const hasNegative = first < 0 || second < 0 || third < 0
  const hasPositive = first > 0 || second > 0 || third > 0
  return !(hasNegative && hasPositive)
}

export function pointInQuad(corners: CornerSet, point: Point) {
  return pointInTriangle(point, corners[0], corners[1], corners[2])
    || pointInTriangle(point, corners[0], corners[2], corners[3])
}

export function translateQuad(corners: CornerSet, deltaX: number, deltaY: number): CornerSet {
  const minX = Math.min(...corners.map((point) => point.x))
  const maxX = Math.max(...corners.map((point) => point.x))
  const minY = Math.min(...corners.map((point) => point.y))
  const maxY = Math.max(...corners.map((point) => point.y))
  const clampedX = Math.max(-minX, Math.min(1 - maxX, deltaX))
  const clampedY = Math.max(-minY, Math.min(1 - maxY, deltaY))
  if (clampedX === 0 && clampedY === 0) return corners
  return corners.map((point) => ({ x: point.x + clampedX, y: point.y + clampedY })) as CornerSet
}

export function dragQuadEdge(corners: CornerSet, edgeIndex: number, target: Point): CornerSet {
  const start = corners[edgeIndex]
  const end = corners[(edgeIndex + 1) % corners.length]
  const deltaX = target.x - (start.x + end.x) / 2
  const deltaY = target.y - (start.y + end.y) / 2
  return corners.map((point, index) => {
    if (index !== edgeIndex && index !== (edgeIndex + 1) % corners.length) return point
    return { x: point.x + deltaX, y: point.y + deltaY }
  }) as CornerSet
}

export function quadEdgeMidpoint(corners: CornerSet, edgeIndex: number): Point {
  const start = corners[edgeIndex]
  const end = corners[(edgeIndex + 1) % corners.length]
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
}

export function quadBoundingBox(corners: CornerSet) {
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}
