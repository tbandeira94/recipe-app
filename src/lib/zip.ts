const encoder = new TextEncoder()
const decoder = new TextDecoder()
const UINT32_MAX = 0xffffffff

const crcTable = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[index] = value >>> 0
}

export function crc32(bytes: Uint8Array): number {
  let crc = UINT32_MAX
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ UINT32_MAX) >>> 0
}

function setUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
}

function zipDate(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export interface ZipSourceEntry {
  name: string
  data: Blob
}

interface WrittenEntry {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
}

export async function createStoredZip(entries: ZipSourceEntry[], onProgress?: (completed: number, total: number) => void): Promise<Blob> {
  if (entries.length > 0xffff) throw new Error('The backup contains too many files.')
  const parts: BlobPart[] = []
  const written: WrittenEntry[] = []
  const { time, day } = zipDate(new Date())
  let offset = 0

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const nameBytes = encoder.encode(entry.name)
    if (!entry.name || nameBytes.length > 0xffff || entry.data.size > UINT32_MAX) throw new Error('A backup entry is too large.')
    const crc = crc32(new Uint8Array(await entry.data.arrayBuffer()))
    const header = new Uint8Array(30)
    const view = new DataView(header.buffer)
    setUint32(view, 0, 0x04034b50)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x0800, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, time, true)
    view.setUint16(12, day, true)
    setUint32(view, 14, crc)
    setUint32(view, 18, entry.data.size)
    setUint32(view, 22, entry.data.size)
    view.setUint16(26, nameBytes.length, true)
    parts.push(header.buffer as ArrayBuffer, nameBytes.buffer as ArrayBuffer, entry.data)
    written.push({ nameBytes, crc, size: entry.data.size, offset })
    offset += header.length + nameBytes.length + entry.data.size
    if (offset > UINT32_MAX) throw new Error('The backup is too large for this archive format.')
    onProgress?.(index + 1, entries.length)
  }

  const centralOffset = offset
  for (const entry of written) {
    const header = new Uint8Array(46)
    const view = new DataView(header.buffer)
    setUint32(view, 0, 0x02014b50)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0x0800, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, time, true)
    view.setUint16(14, day, true)
    setUint32(view, 16, entry.crc)
    setUint32(view, 20, entry.size)
    setUint32(view, 24, entry.size)
    view.setUint16(28, entry.nameBytes.length, true)
    setUint32(view, 42, entry.offset)
    parts.push(header.buffer as ArrayBuffer, entry.nameBytes.buffer as ArrayBuffer)
    offset += header.length + entry.nameBytes.length
  }

  const centralSize = offset - centralOffset
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  setUint32(endView, 0, 0x06054b50)
  endView.setUint16(8, written.length, true)
  endView.setUint16(10, written.length, true)
  setUint32(endView, 12, centralSize)
  setUint32(endView, 16, centralOffset)
  parts.push(end.buffer as ArrayBuffer)
  return new Blob(parts, { type: 'application/zip' })
}

export interface ZipDirectoryEntry {
  name: string
  crc: number
  size: number
  offset: number
}

function assertBounds(offset: number, length: number, total: number): void {
  if (offset < 0 || length < 0 || offset + length > total) throw new Error('The backup archive is truncated.')
}

export async function readStoredZipDirectory(file: Blob): Promise<Map<string, ZipDirectoryEntry>> {
  const prefix = await file.slice(0, Math.min(file.size, 32)).text()
  if (prefix.trimStart().startsWith('{')) throw new Error('Old JSON backups are not supported. Choose a .pantrybook archive.')
  const tailOffset = Math.max(0, file.size - 65_557)
  const tail = new Uint8Array(await file.slice(tailOffset).arrayBuffer())
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let endOffset = -1
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tailView.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break }
  }
  if (endOffset < 0) throw new Error('This file is not a valid Pantry Book archive.')
  const disk = tailView.getUint16(endOffset + 4, true)
  const centralDisk = tailView.getUint16(endOffset + 6, true)
  const diskEntries = tailView.getUint16(endOffset + 8, true)
  const entryCount = tailView.getUint16(endOffset + 10, true)
  const centralSize = tailView.getUint32(endOffset + 12, true)
  const centralOffset = tailView.getUint32(endOffset + 16, true)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error('Multi-part backup archives are not supported.')
  assertBounds(centralOffset, centralSize, file.size)
  const central = new Uint8Array(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer())
  const view = new DataView(central.buffer, central.byteOffset, central.byteLength)
  const entries = new Map<string, ZipDirectoryEntry>()
  let offset = 0
  for (let index = 0; index < entryCount; index += 1) {
    assertBounds(offset, 46, central.length)
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The backup file directory is invalid.')
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const crc = view.getUint32(offset + 16, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    if ((flags & ~0x0800) !== 0 || method !== 0 || compressedSize !== size) throw new Error('The backup uses unsupported ZIP features.')
    assertBounds(offset + 46, nameLength + extraLength + commentLength, central.length)
    const name = decoder.decode(central.subarray(offset + 46, offset + 46 + nameLength))
    if (!name || entries.has(name)) throw new Error('The backup contains duplicate or unnamed files.')
    entries.set(name, { name, crc, size, offset: localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (offset !== central.length) throw new Error('The backup file directory has unexpected data.')
  return entries
}

export async function readStoredZipEntry(file: Blob, entry: ZipDirectoryEntry, validateCrc = true): Promise<Blob> {
  assertBounds(entry.offset, 30, file.size)
  const header = new Uint8Array(await file.slice(entry.offset, entry.offset + 30).arrayBuffer())
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  if (view.getUint32(0, true) !== 0x04034b50 || view.getUint16(6, true) !== 0x0800 || view.getUint16(8, true) !== 0 || view.getUint32(14, true) !== entry.crc || view.getUint32(18, true) !== entry.size || view.getUint32(22, true) !== entry.size) throw new Error(`The ZIP entry “${entry.name}” is invalid.`)
  const nameLength = view.getUint16(26, true)
  const extraLength = view.getUint16(28, true)
  assertBounds(entry.offset + 30, nameLength + extraLength, file.size)
  const localName = decoder.decode(new Uint8Array(await file.slice(entry.offset + 30, entry.offset + 30 + nameLength).arrayBuffer()))
  if (localName !== entry.name) throw new Error(`The ZIP entry “${entry.name}” is invalid.`)
  const dataOffset = entry.offset + 30 + nameLength + extraLength
  assertBounds(dataOffset, entry.size, file.size)
  const blob = file.slice(dataOffset, dataOffset + entry.size)
  if (validateCrc && crc32(new Uint8Array(await blob.arrayBuffer())) !== entry.crc) throw new Error(`The ZIP entry “${entry.name}” is damaged.`)
  return blob
}
