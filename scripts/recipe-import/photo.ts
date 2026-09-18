import sharp from 'sharp'
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_INPUT_BYTES, PHOTO_OUTPUT_SIZE, PHOTO_THUMBNAIL_JPEG_QUALITY, PHOTO_THUMBNAIL_SIZE } from '../../src/lib/photoConfig'
import type { ImageCandidate, ImageImportResult, ImportedPhoto } from './types'

const IMAGE_TIMEOUT_MS = 20_000
const MAX_INPUT_PIXELS = 40_000_000

async function responseBytes(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > PHOTO_MAX_INPUT_BYTES) throw new Error('image exceeds the 25 MB download limit')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('image response has no readable body')
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > PHOTO_MAX_INPUT_BYTES) { await reader.cancel(); throw new Error('image exceeds the 25 MB download limit') }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function downloadAndPrepare(candidate: ImageCandidate): Promise<ImportedPhoto> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)
  try {
    const response = await fetch(candidate.url, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': 'Pantry-Book-Recipe-Import/0.1 (personal local migration utility)', accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
    })
    if (!response.ok) throw new Error(`image request returned HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLocaleLowerCase().startsWith('image/')) throw new Error(`expected an image response but received ${contentType || 'an unknown content type'}`)
    const input = await responseBytes(response)
    const image = sharp(input, { animated: false, limitInputPixels: MAX_INPUT_PIXELS }).rotate()
    const [full, thumbnail] = await Promise.all([
      image.clone().resize(PHOTO_OUTPUT_SIZE, PHOTO_OUTPUT_SIZE, { fit: 'cover', position: 'centre' }).jpeg({ quality: PHOTO_JPEG_QUALITY }).toBuffer(),
      image.clone().resize(PHOTO_THUMBNAIL_SIZE, PHOTO_THUMBNAIL_SIZE, { fit: 'cover', position: 'centre' }).jpeg({ quality: PHOTO_THUMBNAIL_JPEG_QUALITY }).toBuffer(),
    ])
    return { full, thumbnail }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`image request timed out after ${Math.round(IMAGE_TIMEOUT_MS / 1000)} seconds.`, { cause: error })
    throw error
  } finally { clearTimeout(timeout) }
}

export async function downloadRecipePhoto(candidates: ImageCandidate[]): Promise<{ photo: ImportedPhoto | null; result: ImageImportResult }> {
  if (!candidates.length) return { photo: null, result: { status: 'unavailable', attemptedUrls: [], reason: 'No Recipe.image or og:image URL was found.' } }
  const attemptedUrls: string[] = []
  const failures: string[] = []
  for (const candidate of candidates) {
    attemptedUrls.push(candidate.url)
    try {
      const photo = await downloadAndPrepare(candidate)
      return { photo, result: { status: 'downloaded', sourceUrl: candidate.url, source: candidate.source, attemptedUrls } }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'image could not be prepared')
    }
  }
  return { photo: null, result: { status: 'unavailable', attemptedUrls, reason: failures[failures.length - 1] ?? 'No image could be downloaded.' } }
}
