export interface PdfJpegPage {
  bytes: Uint8Array
  width: number
  height: number
}

export interface PdfOptions {
  pageSize?: 'auto' | 'a4' | 'letter'
  margin?: number
}

const encoder = new TextEncoder()

function ascii(value: string) {
  return encoder.encode(value)
}

function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export function createPdf(pages: PdfJpegPage[], options: PdfOptions = {}) {
  if (pages.length === 0) {
    throw new Error('PDF 至少需要一页。')
  }

  const objects: Uint8Array[] = []
  const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')
  objects.push(ascii('<< /Type /Catalog /Pages 2 0 R >>'))
  objects.push(ascii(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`))

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 3
    const imageObject = pageObject + 1
    const contentObject = pageObject + 2
    const portrait = page.height >= page.width
    const size = options.pageSize ?? 'a4'
    let pageWidth: number
    let pageHeight: number
    if (size === 'auto') {
      const ratio = page.width / page.height
      pageWidth = portrait ? 842 * ratio : 842
      pageHeight = portrait ? 842 : 842 / ratio
    } else {
      const base = size === 'letter' ? [612, 792] : [595, 842]
      pageWidth = portrait ? base[0] : base[1]
      pageHeight = portrait ? base[1] : base[0]
    }
    const margin = Math.max(0, Math.min(options.margin ?? 0, Math.min(pageWidth, pageHeight) / 4))
    const availableWidth = pageWidth - margin * 2
    const availableHeight = pageHeight - margin * 2
    const scale = Math.min(availableWidth / page.width, availableHeight / page.height)
    const drawWidth = page.width * scale
    const drawHeight = page.height * scale
    const offsetX = (pageWidth - drawWidth) / 2
    const offsetY = (pageHeight - drawHeight) / 2
    const content = ascii(
      `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${offsetX.toFixed(3)} ${offsetY.toFixed(3)} cm\n/Im0 Do\nQ\n`,
    )

    objects.push(
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      ),
    )
    objects.push(
      concat([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
        ),
        page.bytes,
        ascii('\nendstream'),
      ]),
    )
    objects.push(concat([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('endstream')]))
  })

  const chunks: Uint8Array[] = [concat([ascii('%PDF-1.4\n%'), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii('\n')])]
  const offsets = [0]
  let cursor = chunks[0].length

  objects.forEach((object, index) => {
    offsets.push(cursor)
    const wrapped = concat([ascii(`${index + 1} 0 obj\n`), object, ascii('\nendobj\n')])
    chunks.push(wrapped)
    cursor += wrapped.length
  })

  const xrefOffset = cursor
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join('')
  chunks.push(ascii(xref))
  return concat(chunks)
}
