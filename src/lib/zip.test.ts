import { describe, expect, it } from 'vitest'
import { createStoredZip, crc32, readStoredZipDirectory, readStoredZipEntry, readStoredZipEntryBuffer } from './zip'
import { parseArchiveManifest } from './backupFormat'
import type { Recipe, RecipeArchiveManifest } from '../types'

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'recipe-1', name: 'Soup', description: '', hasPhoto: true, ingredients: [], ingredientNames: [], instructions: ['Heat.'],
  prepMinutes: null, cookMinutes: 10, servings: 2, dishTypes: ['Soup'], mealTypes: ['dinner'], tags: [], favorite: false,
  notes: '', sourceName: '', sourceUrl: '', createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('store-only ZIP archives', () => {
  it('round-trips binary entries and validates CRC values', async () => {
    const archive = await createStoredZip([
      { name: 'manifest.json', data: new Blob(['{}']) },
      { name: 'photos/000001-full.jpg', data: new Blob([new Uint8Array([1, 2, 3, 4])]) },
    ])
    const directory = await readStoredZipDirectory(archive)
    expect([...directory.keys()]).toEqual(['manifest.json', 'photos/000001-full.jpg'])
    const photo = await readStoredZipEntry(archive, directory.get('photos/000001-full.jpg')!)
    expect([...new Uint8Array(await photo.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect([...new Uint8Array(await readStoredZipEntryBuffer(archive, directory.get('photos/000001-full.jpg')!))]).toEqual([1, 2, 3, 4])
    expect(crc32(new Uint8Array([1, 2, 3, 4]))).toBe(directory.get('photos/000001-full.jpg')!.crc)
  })

  it('rejects JSON files and damaged entry contents', async () => {
    await expect(readStoredZipDirectory(new Blob(['{"version":3}']))).rejects.toThrow('Old JSON backups are not supported')
    const archive = await createStoredZip([{ name: 'manifest.json', data: new Blob(['good']) }])
    const bytes = new Uint8Array(await archive.arrayBuffer())
    bytes[30 + 'manifest.json'.length] ^= 0xff
    const damaged = new Blob([bytes])
    const directory = await readStoredZipDirectory(damaged)
    await expect(readStoredZipEntry(damaged, directory.get('manifest.json')!)).rejects.toThrow('damaged')
  })
})

describe('archive manifest validation', () => {
  it('accepts a matching recipe and photo index', () => {
    const manifest: RecipeArchiveManifest = {
      format: 'pantry-book-archive', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', recipes: [recipe()],
      photos: [{ recipeId: 'recipe-1', full: 'photos/000001-full.jpg', thumbnail: 'photos/000001-thumbnail.jpg' }],
    }
    expect(parseArchiveManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('rejects unsupported versions, duplicate IDs, path traversal, and missing photo mappings', () => {
    const base = { format: 'pantry-book-archive', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', recipes: [recipe()], photos: [] }
    expect(() => parseArchiveManifest(JSON.stringify({ ...base, version: 2 }))).toThrow('not supported')
    expect(() => parseArchiveManifest(JSON.stringify({ ...base, recipes: [recipe(), recipe()] }))).toThrow('duplicate recipe IDs')
    expect(() => parseArchiveManifest(JSON.stringify({ ...base, photos: [{ recipeId: 'recipe-1', full: '../full.jpg', thumbnail: 'photos/000001-thumbnail.jpg' }] }))).toThrow('invalid photo path')
    expect(() => parseArchiveManifest(JSON.stringify(base))).toThrow('photo index does not match')
  })
})
