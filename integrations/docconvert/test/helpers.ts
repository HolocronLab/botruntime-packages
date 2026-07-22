import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'

export function makeDocx(extraEntries: string[] = []): Uint8Array {
  return makeStoredZip([
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
    ...extraEntries,
  ])
}

export async function makePdf(pageCount = 2): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let index = 0; index < pageCount; index++) document.addPage([595, 842])
  return document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false })
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function bodyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function makeStoredZip(names: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const name of names) {
    const nameBytes = encoder.encode(name)
    const content = encoder.encode(name.endsWith('.xml') ? '<root/>' : '')
    const local = new Uint8Array(30 + nameBytes.length + content.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint32(18, content.length, true)
    localView.setUint32(22, content.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(content, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint32(20, content.length, true)
    centralView.setUint32(24, content.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, localOffset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)
    localOffset += local.length
  }

  const centralSize = centralParts.reduce((sum, value) => sum + value.length, 0)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(8, names.length, true)
  eocdView.setUint16(10, names.length, true)
  eocdView.setUint32(12, centralSize, true)
  eocdView.setUint32(16, localOffset, true)
  return concat([...localParts, ...centralParts, eocd])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, value) => sum + value.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}
