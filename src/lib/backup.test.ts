import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recipe, RecipeArchiveManifest } from '../types'
import { createStoredZip } from './zip'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const recipe = (id: string, name: string, hasPhoto = false): Recipe => ({
  id, name, description: '', hasPhoto, ingredients: [], ingredientNames: [], instructions: ['Cook.'], prepMinutes: null,
  cookMinutes: null, servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false, notes: '', sourceName: '',
  sourceUrl: '', createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
})

async function deleteDatabase(name = 'pantry-book'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function archiveFile(importedRecipe: Recipe, full: Uint8Array): Promise<File> {
  const manifest: RecipeArchiveManifest = {
    format: 'pantry-book-archive', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', recipes: [importedRecipe],
    photos: importedRecipe.hasPhoto ? [{ recipeId: importedRecipe.id, full: 'photos/000001-full.jpg', thumbnail: 'photos/000001-thumbnail.jpg' }] : [],
  }
  const entries = [
    { name: 'manifest.json', data: new Blob([JSON.stringify(manifest)]) },
    ...(importedRecipe.hasPhoto ? [
      { name: 'photos/000001-full.jpg', data: new Blob([Uint8Array.from(full).buffer]) },
      { name: 'photos/000001-thumbnail.jpg', data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x01]).buffer]) },
    ] : []),
  ]
  return new File([await createStoredZip(entries)], 'backup.pantrybook', { type: 'application/zip' })
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('localStorage', new MemoryStorage())
  await deleteDatabase()
})

describe('staged backup restore', () => {
  it('activates a verified staged database and reports committed progress', async () => {
    const backup = await import('./backup')
    const database = await import('./database')
    const progress: string[] = []
    const count = await backup.importBackup(await archiveFile(recipe('new', 'Imported', true), new Uint8Array([0xff, 0xd8, 0xff, 0x00])), ({ phase, completed }) => progress.push(`${phase}:${completed}`))

    expect(count).toBe(1)
    expect((await database.getRecipes()).map((item) => item.name)).toEqual(['Imported'])
    expect(await (await database.getRecipePhoto('new', 'full'))?.arrayBuffer()).toBeInstanceOf(ArrayBuffer)
    expect(progress).toContain('recipes:1')
    expect(progress).toContain('photos:2')
    expect(progress.at(-1)).toBe('activate:1')
  })

  it('keeps the active library when late photo validation fails', async () => {
    const database = await import('./database')
    const backup = await import('./backup')
    await database.saveRecipe({
      name: 'Keep me', description: '', ingredients: [], instructions: ['Cook.'], prepMinutes: null, cookMinutes: null,
      servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false, notes: '', sourceName: '', sourceUrl: '',
    }, { kind: 'keep' })

    const invalid = await archiveFile(recipe('bad', 'Bad photo', true), new Uint8Array([0x00, 0x01, 0x02]))
    await expect(backup.importBackup(invalid)).rejects.toThrow('not a JPEG')
    expect((await database.getRecipes()).map((item) => item.name)).toEqual(['Keep me'])
  })
})
