export interface ZipEntry {
  name: string
  data: Uint8Array
}

const encoder = new TextEncoder()

function concat(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.length
  })
  return result
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function view(size: number) {
  const bytes = new Uint8Array(size)
  return { bytes, data: new DataView(bytes.buffer) }
}

export function createZip(entries: ZipEntry[]) {
  if (entries.length === 0) throw new Error('ZIP 至少需要一个文件。')
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let localOffset = 0

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name)
    const checksum = crc32(entry.data)
    const local = view(30)
    local.data.setUint32(0, 0x04034b50, true)
    local.data.setUint16(4, 20, true)
    local.data.setUint16(6, 0x0800, true)
    local.data.setUint32(14, checksum, true)
    local.data.setUint32(18, entry.data.length, true)
    local.data.setUint32(22, entry.data.length, true)
    local.data.setUint16(26, name.length, true)
    localChunks.push(local.bytes, name, entry.data)

    const central = view(46)
    central.data.setUint32(0, 0x02014b50, true)
    central.data.setUint16(4, 20, true)
    central.data.setUint16(6, 20, true)
    central.data.setUint16(8, 0x0800, true)
    central.data.setUint32(16, checksum, true)
    central.data.setUint32(20, entry.data.length, true)
    central.data.setUint32(24, entry.data.length, true)
    central.data.setUint16(28, name.length, true)
    central.data.setUint32(42, localOffset, true)
    centralChunks.push(central.bytes, name)
    localOffset += local.bytes.length + name.length + entry.data.length
  })

  const centralDirectory = concat(centralChunks)
  const end = view(22)
  end.data.setUint32(0, 0x06054b50, true)
  end.data.setUint16(8, entries.length, true)
  end.data.setUint16(10, entries.length, true)
  end.data.setUint32(12, centralDirectory.length, true)
  end.data.setUint32(16, localOffset, true)
  return concat([...localChunks, centralDirectory, end.bytes])
}
