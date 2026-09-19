import type { RecipeArchiveManifest } from '../types'
import {
  activateStagingLibrary,
  checkpointStagingLibrary,
  createStagingLibrary,
  discardStagingLibrary,
  getRecipePhoto,
  getRecipes,
  stagePhotoBatch,
  stageRecipeBatch,
  verifyStagingLibrary,
  type RecipePhotoRecord,
  type StagingLibrary,
} from './database'
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, parseArchiveManifest } from './backupFormat'
import { assertStorageCapacity } from './storage'
import { createStoredZip, readStoredZipDirectory, readStoredZipEntry, type ZipDirectoryEntry, type ZipSourceEntry } from './zip'

export interface BackupProgress {
  phase: 'export' | 'inspect' | 'recipes' | 'photos' | 'activate'
  completed: number
  total: number
}

export interface BackupInspection {
  recipeCount: number
  exportedAt: string
}

type ProgressHandler = (progress: BackupProgress) => void

async function readManifest(file: Blob, entries: Map<string, ZipDirectoryEntry>): Promise<RecipeArchiveManifest> {
  const entry = entries.get('manifest.json')
  if (!entry) throw new Error('The backup is missing manifest.json.')
  if (entry.size > 20 * 1024 * 1024) throw new Error('The backup manifest is unexpectedly large.')
  const blob = await readStoredZipEntry(file, entry)
  return parseArchiveManifest(await blob.text())
}

function expectedEntryNames(manifest: RecipeArchiveManifest): Set<string> {
  return new Set(['manifest.json', ...manifest.photos.flatMap((photo) => [photo.full, photo.thumbnail])])
}

function validateDirectory(manifest: RecipeArchiveManifest, entries: Map<string, ZipDirectoryEntry>): void {
  const expected = expectedEntryNames(manifest)
  if (entries.size !== expected.size || [...entries.keys()].some((name) => !expected.has(name))) throw new Error('The backup contains missing or unexpected files.')
  for (const name of expected) if (!entries.has(name)) throw new Error(`The backup is missing “${name}”.`)
}

export async function inspectBackup(file: File): Promise<BackupInspection> {
  const entries = await readStoredZipDirectory(file)
  const manifest = await readManifest(file, entries)
  validateDirectory(manifest, entries)
  return { recipeCount: manifest.recipes.length, exportedAt: manifest.exportedAt }
}

export async function prepareBackup(onProgress?: ProgressHandler): Promise<File> {
  const recipes = await getRecipes()
  const photos = recipes.filter((recipe) => recipe.hasPhoto).map((recipe, index) => {
    const ordinal = String(index + 1).padStart(6, '0')
    return { recipeId: recipe.id, full: `photos/${ordinal}-full.jpg`, thumbnail: `photos/${ordinal}-thumbnail.jpg` }
  })
  const manifest: RecipeArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
    photos,
  }
  const sources: ZipSourceEntry[] = [{ name: 'manifest.json', data: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }]
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]
    const [full, thumbnail] = await Promise.all([
      getRecipePhoto(photo.recipeId, 'full'),
      getRecipePhoto(photo.recipeId, 'thumbnail'),
    ])
    if (!full || !thumbnail) throw new Error('A recipe photo is incomplete. Open and resave that recipe, then try again.')
    sources.push({ name: photo.full, data: full }, { name: photo.thumbnail, data: thumbnail })
  }
  const archive = await createStoredZip(sources, (completed, total) => onProgress?.({ phase: 'export', completed, total }))
  const date = manifest.exportedAt.slice(0, 10)
  return new File([archive], `recipes-backup-${date}.pantrybook`, { type: 'application/zip' })
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function downloadBackup(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Must be called directly from a user click so browser download/share permission is available. */
export async function deliverBackup(file: File): Promise<'shared' | 'downloaded'> {
  if (isMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Pantry Book backup' })
      return 'shared'
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') throw error
      // A desktop-style share permission denial is recoverable: download the
      // already prepared file while this click still has user activation.
    }
  }
  downloadBackup(file)
  return 'downloaded'
}

export async function importBackup(file: File, onProgress?: ProgressHandler): Promise<number> {
  await assertStorageCapacity(Math.ceil(file.size * 1.25))
  onProgress?.({ phase: 'inspect', completed: 0, total: 1 })
  const entries = await readStoredZipDirectory(file)
  const manifest = await readManifest(file, entries)
  validateDirectory(manifest, entries)
  onProgress?.({ phase: 'inspect', completed: 1, total: 1 })

  let staging: StagingLibrary | undefined
  let activated = false
  try {
    staging = await createStagingLibrary()
    for (let offset = 0; offset < manifest.recipes.length; offset += 100) {
      const batch = manifest.recipes.slice(offset, offset + 100)
      await stageRecipeBatch(staging, batch)
      onProgress?.({ phase: 'recipes', completed: offset + batch.length, total: manifest.recipes.length })
    }

    const photoTotal = manifest.photos.length
    let photoCompleted = 0
    let batchBytes = 0
    let batchPhotos = 0
    let batch: RecipePhotoRecord[] = []
    const flushPhotos = async () => {
      if (!batch.length || !staging) return
      const count = batchPhotos
      await stagePhotoBatch(staging, batch)
      photoCompleted += count
      onProgress?.({ phase: 'photos', completed: photoCompleted, total: photoTotal })
      batch = []
      batchBytes = 0
      batchPhotos = 0
    }

    for (const photo of manifest.photos) {
      const pair: RecipePhotoRecord[] = []
      let pairBytes = 0
      for (const variant of ['full', 'thumbnail'] as const) {
        const path = photo[variant]
        const entry = entries.get(path)
        if (!entry) throw new Error(`The backup is missing “${path}”.`)
        const sizeLimit = variant === 'full' ? 25 * 1024 * 1024 : 2 * 1024 * 1024
        if (entry.size < 3 || entry.size > sizeLimit) throw new Error(`The photo “${path}” has an invalid size.`)
        const data = await readStoredZipEntry(file, entry)
        const signature = new Uint8Array(await data.slice(0, 3).arrayBuffer())
        if (signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) throw new Error(`The photo “${path}” is not a JPEG.`)
        pair.push({ recipeId: photo.recipeId, variant, blob: new Blob([data], { type: 'image/jpeg' }) })
        pairBytes += data.size
      }
      if (batchPhotos && (batchPhotos >= 10 || batchBytes + pairBytes > 8 * 1024 * 1024)) await flushPhotos()
      batch.push(...pair)
      batchBytes += pairBytes
      batchPhotos += 1
    }
    await flushPhotos()
    if (staging.photoBatchesSinceCheckpoint > 0) await checkpointStagingLibrary(staging)

    onProgress?.({ phase: 'activate', completed: 0, total: 1 })
    await verifyStagingLibrary(staging, manifest.recipes.length, photoTotal * 2)
    await activateStagingLibrary(staging, manifest.recipes.length)
    activated = true
    onProgress?.({ phase: 'activate', completed: 1, total: 1 })
    return manifest.recipes.length
  } catch (error) {
    if (staging && !activated) await discardStagingLibrary(staging)
    throw error
  }
}
