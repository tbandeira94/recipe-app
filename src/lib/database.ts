import type { Recipe, RecipeDraft } from '../types'
import { materializeRecipe } from './recipeModel'

const DATABASE_NAME = 'pantry-book'
const DATABASE_VERSION = 2
const RECIPE_STORE = 'recipes'

let databasePromise: Promise<IDBDatabase> | undefined

function normalizeStoredRecipe(recipe: Recipe): Recipe {
  return { ...recipe, photoDataUrl: recipe.photoDataUrl ?? null }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Database request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Database transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Database transaction was cancelled.'))
  })
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (database.objectStoreNames.contains(RECIPE_STORE)) database.deleteObjectStore(RECIPE_STORE)
        const store = database.createObjectStore(RECIPE_STORE, { keyPath: 'id' })
        store.createIndex('modifiedAt', 'modifiedAt')
        store.createIndex('ingredientNames', 'ingredientNames', { multiEntry: true })
        store.createIndex('tags', 'tags', { multiEntry: true })
        store.createIndex('dishTypes', 'dishTypes', { multiEntry: true })
        store.createIndex('mealTypes', 'mealTypes', { multiEntry: true })
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
      request.onblocked = () => reject(new Error('Close other Pantry Book tabs, then try again.'))
    })
  }
  return databasePromise
}

export async function getRecipes(): Promise<Recipe[]> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readonly')
  const recipes = await requestResult(transaction.objectStore(RECIPE_STORE).getAll())
  return recipes.map(normalizeStoredRecipe).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readonly')
  const recipe = await requestResult<Recipe | undefined>(transaction.objectStore(RECIPE_STORE).get(id))
  return recipe ? normalizeStoredRecipe(recipe) : undefined
}

function prepareRecipe(draft: RecipeDraft, existing?: Recipe): Recipe {
  const now = new Date().toISOString()
  const recipe = materializeRecipe(draft, { id: existing?.id, now })
  return { ...recipe, createdAt: existing?.createdAt ?? now }
}

export async function setRecipeFavorite(id: string, favorite: boolean): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readwrite')
  const store = transaction.objectStore(RECIPE_STORE)
  const recipe = await requestResult<Recipe | undefined>(store.get(id))
  if (!recipe) {
    transaction.abort()
    throw new Error('Recipe not found.')
  }
  store.put({ ...normalizeStoredRecipe(recipe), favorite })
  await transactionComplete(transaction)
}

export async function saveRecipe(draft: RecipeDraft, existing?: Recipe): Promise<Recipe> {
  const recipe = prepareRecipe(draft, existing)
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readwrite')
  transaction.objectStore(RECIPE_STORE).put(recipe)
  await transactionComplete(transaction)
  return recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readwrite')
  transaction.objectStore(RECIPE_STORE).delete(id)
  await transactionComplete(transaction)
}

export async function replaceAllRecipes(recipes: Recipe[]): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readwrite')
  const store = transaction.objectStore(RECIPE_STORE)
  store.clear()
  recipes.forEach((recipe) => store.put(recipe))
  await transactionComplete(transaction)
}
