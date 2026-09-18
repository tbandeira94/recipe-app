import { describe, expect, it } from 'vitest'
import type { Recipe, RecipeArchiveManifest } from '../../src/types'
import { createStoredZip, readStoredZipDirectory } from '../../src/lib/zip'
import { createRecipeArchive, readRecipeArchive } from './archive'
import { resultsForReport } from './report'
import type { BatchResult, ImportedPhoto } from './types'

const jpeg = (...body: number[]): Buffer => Buffer.from([0xff, 0xd8, 0xff, ...body, 0xd9])

const recipe = (id: string, hasPhoto: boolean, sourceUrl = `https://example.test/${id}`): Recipe => ({
  id, name: `Recipe ${id}`, description: '', hasPhoto, ingredients: [], ingredientNames: [], instructions: ['Cook.'],
  prepMinutes: null, cookMinutes: null, servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false,
  notes: '', sourceName: '', sourceUrl, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
})

describe('recipe importer archives', () => {
  it('creates a canonical store-only archive and round-trips its photo pairs', async () => {
    const firstPhoto: ImportedPhoto = { full: jpeg(1, 2, 3), thumbnail: jpeg(4, 5) }
    const secondPhoto: ImportedPhoto = { full: jpeg(6, 7), thumbnail: jpeg(8) }
    const recipes = [recipe('without-photo', false), recipe('first', true), recipe('second', true)]
    const { archive, manifest } = await createRecipeArchive(recipes, new Map([['first', firstPhoto], ['second', secondPhoto]]), '2026-09-18T12:00:00.000Z')

    expect(manifest.photos).toEqual([
      { recipeId: 'first', full: 'photos/000001-full.jpg', thumbnail: 'photos/000001-thumbnail.jpg' },
      { recipeId: 'second', full: 'photos/000002-full.jpg', thumbnail: 'photos/000002-thumbnail.jpg' },
    ])
    const entries = await readStoredZipDirectory(archive)
    expect([...entries.keys()]).toEqual([
      'manifest.json',
      'photos/000001-full.jpg', 'photos/000001-thumbnail.jpg',
      'photos/000002-full.jpg', 'photos/000002-thumbnail.jpg',
    ])
    const restored = await readRecipeArchive(archive)
    expect(restored.manifest).toEqual(manifest)
    expect(restored.photos.get('first')).toEqual(firstPhoto)
    expect(restored.photos.get('second')).toEqual(secondPhoto)
  })

  it('preserves base photo bytes while reindexing the combined recipe order', async () => {
    const basePhoto: ImportedPhoto = { full: jpeg(10), thumbnail: jpeg(11) }
    const base = await createRecipeArchive([recipe('base', true)], new Map([['base', basePhoto]]))
    const loaded = await readRecipeArchive(base.archive)
    const importedPhoto: ImportedPhoto = { full: jpeg(12), thumbnail: jpeg(13) }
    loaded.photos.set('new', importedPhoto)

    const merged = await createRecipeArchive([...loaded.manifest.recipes, recipe('new', true)], loaded.photos)
    const restored = await readRecipeArchive(merged.archive)
    expect(restored.manifest.recipes.map((item) => item.id)).toEqual(['base', 'new'])
    expect(restored.manifest.photos.map((item) => item.full)).toEqual(['photos/000001-full.jpg', 'photos/000002-full.jpg'])
    expect(restored.photos.get('base')).toEqual(basePhoto)
    expect(restored.photos.get('new')).toEqual(importedPhoto)
  })

  it('rejects JSON and incomplete or unreferenced photo data', async () => {
    await expect(readRecipeArchive(new Blob(['{"version":3}']))).rejects.toThrow('Old JSON backups are not supported')
    await expect(createRecipeArchive([recipe('missing', true)], new Map())).rejects.toThrow('incomplete')
    await expect(createRecipeArchive([recipe('none', false)], new Map([['none', { full: jpeg(1), thumbnail: jpeg(2) }]]))).rejects.toThrow('marked as having no photo')
  })

  it('rejects missing and unexpected ZIP entries', async () => {
    const manifest: RecipeArchiveManifest = {
      format: 'pantry-book-archive', version: 1, exportedAt: '2026-09-18T12:00:00.000Z', recipes: [recipe('photo', true)],
      photos: [{ recipeId: 'photo', full: 'photos/000001-full.jpg', thumbnail: 'photos/000001-thumbnail.jpg' }],
    }
    const missing = await createStoredZip([{ name: 'manifest.json', data: new Blob([JSON.stringify(manifest)]) }])
    await expect(readRecipeArchive(missing)).rejects.toThrow('missing or unexpected files')

    const noPhotoManifest = { ...manifest, recipes: [recipe('plain', false)], photos: [] }
    const extra = await createStoredZip([
      { name: 'manifest.json', data: new Blob([JSON.stringify(noPhotoManifest)]) },
      { name: 'unexpected.txt', data: new Blob(['extra']) },
    ])
    await expect(readRecipeArchive(extra)).rejects.toThrow('missing or unexpected files')
  })

  it('removes binary photos from JSON report results', () => {
    const result: BatchResult = {
      status: 'success', inputUrl: 'https://example.test', sourceUrl: 'https://example.test', recipe: recipe('reported', true),
      photo: { full: jpeg(1), thumbnail: jpeg(2) }, image: { status: 'downloaded', sourceUrl: 'https://example.test/photo.jpg', source: 'recipe-image', attemptedUrls: ['https://example.test/photo.jpg'] },
      warnings: [], unmappedFields: [], raw: {},
    }
    const serialized = JSON.stringify(resultsForReport([result]))
    expect(serialized).not.toContain('"photo"')
    expect(serialized).not.toContain('"data"')
    expect(serialized).toContain('"hasPhoto":true')
  })
})
