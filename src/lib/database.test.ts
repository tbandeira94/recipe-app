import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeDraft } from '../types'

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

  it('deletes image records with their recipe and atomically replaces a library', async () => {
    const database = await import('./database')
    const saved = await database.saveRecipe(draft(), { kind: 'replace', photo: { full: new Blob(['a']), thumbnail: new Blob(['b']) } })
    await database.deleteRecipe(saved.id)
    expect(await database.getRecipes()).toEqual([])
    expect(await database.getRecipePhoto(saved.id, 'thumbnail')).toBeUndefined()

    const replacement = { ...saved, id: 'replacement', name: 'Replacement' }
    await database.replaceLibrary([replacement], [
      { recipeId: replacement.id, variant: 'full', blob: new Blob(['new-full']) },
      { recipeId: replacement.id, variant: 'thumbnail', blob: new Blob(['new-thumb']) },
    ])
    expect((await database.getRecipes()).map((item) => item.id)).toEqual(['replacement'])
    expect(await (await database.getRecipePhoto('replacement', 'full'))?.text()).toBe('new-full')
  })

  it('keeps the current library when replacement cannot be queued', async () => {
    const database = await import('./database')
    const saved = await database.saveRecipe(draft('Keep me'), { kind: 'keep' })
    const invalid = { ...saved, id: 'invalid', notes: Symbol('not cloneable') as unknown as string }
    await expect(database.replaceLibrary([invalid], [])).rejects.toThrow()
    expect((await database.getRecipes()).map((item) => item.name)).toEqual(['Keep me'])
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
