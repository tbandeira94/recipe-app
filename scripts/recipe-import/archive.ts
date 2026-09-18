import type { Recipe, RecipeArchiveManifest } from '../../src/types'
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, parseArchiveManifest } from '../../src/lib/backupFormat'
import { createStoredZip, readStoredZipDirectory, readStoredZipEntry, type ZipDirectoryEntry, type ZipSourceEntry } from '../../src/lib/zip'
import type { ImportedPhoto } from './types'

const MANIFEST_MAX_BYTES = 20 * 1024 * 1024
const FULL_PHOTO_MAX_BYTES = 25 * 1024 * 1024
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024

export interface RecipeArchiveContents {
  manifest: RecipeArchiveManifest
  photos: Map<string, ImportedPhoto>
}

function expectedEntryNames(manifest: RecipeArchiveManifest): Set<string> {
  return new Set(['manifest.json', ...manifest.photos.flatMap((photo) => [photo.full, photo.thumbnail])])
}

function validateDirectory(manifest: RecipeArchiveManifest, entries: Map<string, ZipDirectoryEntry>): void {
  const expected = expectedEntryNames(manifest)
  if (entries.size !== expected.size || [...entries.keys()].some((name) => !expected.has(name))) throw new Error('The backup contains missing or unexpected files.')
  for (const name of expected) if (!entries.has(name)) throw new Error(`The backup is missing “${name}”.`)
}

async function readJpeg(file: Blob, entry: ZipDirectoryEntry, maximumSize: number): Promise<Buffer> {
  if (entry.size < 3 || entry.size > maximumSize) throw new Error(`The photo “${entry.name}” has an invalid size.`)
  const data = await readStoredZipEntry(file, entry)
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error(`The photo “${entry.name}” is not a JPEG.`)
  return Buffer.from(bytes)
}

/** Reads and fully validates the same archive contract accepted by PWA restore. */
export async function readRecipeArchive(file: Blob): Promise<RecipeArchiveContents> {
  const entries = await readStoredZipDirectory(file)
  const manifestEntry = entries.get('manifest.json')
  if (!manifestEntry) throw new Error('The backup is missing manifest.json.')
  if (manifestEntry.size > MANIFEST_MAX_BYTES) throw new Error('The backup manifest is unexpectedly large.')
  const manifest = parseArchiveManifest(await (await readStoredZipEntry(file, manifestEntry)).text())
  validateDirectory(manifest, entries)

  const photos = new Map<string, ImportedPhoto>()
  for (const photo of manifest.photos) {
    const fullEntry = entries.get(photo.full)
    const thumbnailEntry = entries.get(photo.thumbnail)
    if (!fullEntry) throw new Error(`The backup is missing “${photo.full}”.`)
    if (!thumbnailEntry) throw new Error(`The backup is missing “${photo.thumbnail}”.`)
    const [full, thumbnail] = await Promise.all([
      readJpeg(file, fullEntry, FULL_PHOTO_MAX_BYTES),
      readJpeg(file, thumbnailEntry, THUMBNAIL_MAX_BYTES),
    ])
    photos.set(photo.recipeId, { full, thumbnail })
  }
  return { manifest, photos }
}

function blobFromBuffer(buffer: Buffer): Blob {
  return new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' })
}

/** Creates a canonical archive and validates the completed bytes before returning them. */
export async function createRecipeArchive(recipes: Recipe[], photosByRecipeId: Map<string, ImportedPhoto>, exportedAt = new Date().toISOString()): Promise<{ archive: Blob; manifest: RecipeArchiveManifest }> {
  const recipeIds = new Set(recipes.map((recipe) => recipe.id))
  for (const recipeId of photosByRecipeId.keys()) {
    if (!recipeIds.has(recipeId)) throw new Error(`A photo references unknown recipe “${recipeId}”.`)
  }

  const photos = recipes.filter((recipe) => recipe.hasPhoto).map((recipe, index) => {
    if (!photosByRecipeId.has(recipe.id)) throw new Error(`The photo for “${recipe.name}” is incomplete.`)
    const ordinal = String(index + 1).padStart(6, '0')
    return { recipeId: recipe.id, full: `photos/${ordinal}-full.jpg`, thumbnail: `photos/${ordinal}-thumbnail.jpg` }
  })
  if (photos.length !== photosByRecipeId.size) throw new Error('The archive contains a photo for a recipe marked as having no photo.')

  const manifest: RecipeArchiveManifest = { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, exportedAt, recipes, photos }
  parseArchiveManifest(JSON.stringify(manifest))
  const sources: ZipSourceEntry[] = [{ name: 'manifest.json', data: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }]
  for (const photo of photos) {
    const data = photosByRecipeId.get(photo.recipeId)!
    sources.push(
      { name: photo.full, data: blobFromBuffer(data.full) },
      { name: photo.thumbnail, data: blobFromBuffer(data.thumbnail) },
    )
  }
  const archive = await createStoredZip(sources)
  await readRecipeArchive(archive)
  return { archive, manifest }
}
