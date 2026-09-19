import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeDraft } from '../types'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const draft = (name = 'Soup'): RecipeDraft => ({
  name, description: '', ingredients: [{ id: 'ingredient-1', name: 'Water', normalizedName: 'water', quantity: '1', unit: 'cup' }],
  instructions: ['Heat.'], prepMinutes: null, cookMinutes: 10, servings: 2, dishTypes: ['Soup'], mealTypes: ['dinner'], tags: [],
  favorite: false, notes: '', sourceName: '', sourceUrl: '',
})

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('pantry-book')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('localStorage', new MemoryStorage())
  await deleteDatabase()
})

describe('recipe and photo storage', () => {
  it('stores photos separately and preserves them during metadata-only edits', async () => {
    const database = await import('./database')
    const full = new Blob(['full'], { type: 'image/jpeg' })
    const thumbnail = new Blob(['thumb'], { type: 'image/jpeg' })
    const saved = await database.saveRecipe(draft(), { kind: 'replace', photo: { full, thumbnail } })
    expect((await database.getRecipes())[0]).toMatchObject({ id: saved.id, hasPhoto: true })
    expect(await (await database.getRecipePhoto(saved.id, 'full'))?.text()).toBe('full')

    const edited = await database.saveRecipe(draft('Better Soup'), { kind: 'keep' }, saved)
    await database.setRecipeFavorite(edited.id, true)
    expect(await (await database.getRecipePhoto(saved.id, 'thumbnail'))?.text()).toBe('thumb')
    expect((await database.getRecipe(saved.id))?.favorite).toBe(true)

    const removed = await database.saveRecipe(draft('No-photo Soup'), { kind: 'remove' }, edited)
    expect(removed.hasPhoto).toBe(false)
    expect(await database.getRecipePhoto(saved.id, 'full')).toBeUndefined()
  })

  it('deletes image records with their recipe and atomically activates a staged library', async () => {
    const database = await import('./database')
    const saved = await database.saveRecipe(draft(), { kind: 'replace', photo: { full: new Blob(['a']), thumbnail: new Blob(['b']) } })
    await database.deleteRecipe(saved.id)
    expect(await database.getRecipes()).toEqual([])
    expect(await database.getRecipePhoto(saved.id, 'thumbnail')).toBeUndefined()

    const replacement = { ...saved, id: 'replacement', name: 'Replacement' }
    const staging = await database.createStagingLibrary()
    await database.stageRecipeBatch(staging, [replacement])
    await database.stagePhotoBatch(staging, [
      { recipeId: replacement.id, variant: 'full', blob: new Blob(['new-full']) },
      { recipeId: replacement.id, variant: 'thumbnail', blob: new Blob(['new-thumb']) },
    ])
    await database.verifyStagingLibrary(staging, 1, 2)
    await database.activateStagingLibrary(staging, 1)
    expect((await database.getRecipes()).map((item) => item.id)).toEqual(['replacement'])
    expect(await (await database.getRecipePhoto('replacement', 'full'))?.text()).toBe('new-full')
  })

  it('keeps the current library when a staging batch cannot be queued', async () => {
    const database = await import('./database')
    const saved = await database.saveRecipe(draft('Keep me'), { kind: 'keep' })
    const invalid = { ...saved, id: 'invalid', notes: Symbol('not cloneable') as unknown as string }
    const staging = await database.createStagingLibrary()
    await expect(database.stageRecipeBatch(staging, [invalid])).rejects.toThrow()
    expect((await database.getRecipes()).map((item) => item.name)).toEqual(['Keep me'])
    await database.discardStagingLibrary(staging)
  })

  it('prevents concurrent restores and releases the lock after discard', async () => {
    const database = await import('./database')
    const first = await database.createStagingLibrary()
    await expect(database.createStagingLibrary()).rejects.toThrow('already running')
    await database.discardStagingLibrary(first)
    const second = await database.createStagingLibrary()
    await database.discardStagingLibrary(second)
  })

  it('checkpoints after five photo batches and preserves staged records', async () => {
    const database = await import('./database')
    const staging = await database.createStagingLibrary()
    const firstConnection = staging.database
    for (let index = 0; index < 4; index += 1) {
      await database.stagePhotoBatch(staging, [{ recipeId: `recipe-${index}`, variant: 'full', blob: new Blob([String(index)]) }])
    }
    expect(staging.database).toBe(firstConnection)
    await database.stagePhotoBatch(staging, [{ recipeId: 'recipe-4', variant: 'full', blob: new Blob(['4']) }])
    expect(staging.database).not.toBe(firstConnection)
    expect(staging.photoBatchesSinceCheckpoint).toBe(0)
    await database.verifyStagingLibrary(staging, 0, 5)

    const secondConnection = staging.database
    await database.stagePhotoBatch(staging, [{ recipeId: 'recipe-5', variant: 'full', blob: new Blob(['5']) }])
    await database.checkpointStagingLibrary(staging)
    expect(staging.database).not.toBe(secondConnection)
    await database.verifyStagingLibrary(staging, 0, 6)
    await database.discardStagingLibrary(staging)
  })

  it('recreates the unreleased version-2 schema instead of migrating base64 records', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pantry-book', 2)
      request.onupgradeneeded = () => request.result.createObjectStore('recipes', { keyPath: 'id' }).put({ id: 'old', photoDataUrl: 'data:image/jpeg;base64,AA==' })
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
    })
    const database = await import('./database')
    expect(await database.getRecipes()).toEqual([])
    expect([...((await database.openDatabase()).objectStoreNames)]).toEqual(['recipePhotos', 'recipes'])
  })
})
