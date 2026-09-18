import type { PhotoUpdate, Recipe, RecipeDraft, RecipePhotoVariant } from '../types'
import { materializeRecipe } from './recipeModel'

const DATABASE_NAME = 'pantry-book'
const DATABASE_VERSION = 3
const RECIPE_STORE = 'recipes'
const PHOTO_STORE = 'recipePhotos'

export interface RecipePhotoRecord {
  recipeId: string
  variant: RecipePhotoVariant
  blob: Blob
}

let databasePromise: Promise<IDBDatabase> | undefined

function normalizeStoredRecipe(recipe: Recipe): Recipe {
  return { ...recipe, hasPhoto: Boolean(recipe.hasPhoto) }
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

function createRecipeStore(database: IDBDatabase): void {
  const store = database.createObjectStore(RECIPE_STORE, { keyPath: 'id' })
  store.createIndex('modifiedAt', 'modifiedAt')
  store.createIndex('ingredientNames', 'ingredientNames', { multiEntry: true })
  store.createIndex('tags', 'tags', { multiEntry: true })
  store.createIndex('dishTypes', 'dishTypes', { multiEntry: true })
  store.createIndex('mealTypes', 'mealTypes', { multiEntry: true })
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        // This unreleased schema intentionally starts clean instead of carrying
        // the old base64 photo representation forward.
        for (const storeName of [...database.objectStoreNames]) database.deleteObjectStore(storeName)
        createRecipeStore(database)
        const photos = database.createObjectStore(PHOTO_STORE, { keyPath: ['recipeId', 'variant'] })
        photos.createIndex('recipeId', 'recipeId')
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
  const recipes = await requestResult<Recipe[]>(transaction.objectStore(RECIPE_STORE).getAll())
  return recipes.map(normalizeStoredRecipe).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readonly')
  const recipe = await requestResult<Recipe | undefined>(transaction.objectStore(RECIPE_STORE).get(id))
  return recipe ? normalizeStoredRecipe(recipe) : undefined
}

export async function getRecipePhoto(recipeId: string, variant: RecipePhotoVariant): Promise<Blob | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(PHOTO_STORE, 'readonly')
  const record = await requestResult<RecipePhotoRecord | undefined>(transaction.objectStore(PHOTO_STORE).get([recipeId, variant]))
  return record?.blob
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

export async function saveRecipe(draft: RecipeDraft, photoUpdate: PhotoUpdate, existing?: Recipe): Promise<Recipe> {
  const hasPhoto = photoUpdate.kind === 'replace' ? true : photoUpdate.kind === 'remove' ? false : Boolean(existing?.hasPhoto)
  const now = new Date().toISOString()
  const recipe = {
    ...materializeRecipe(draft, { id: existing?.id, now, hasPhoto }),
    createdAt: existing?.createdAt ?? now,
  }
  const database = await openDatabase()
  const transaction = database.transaction([RECIPE_STORE, PHOTO_STORE], 'readwrite')
  const photos = transaction.objectStore(PHOTO_STORE)
  transaction.objectStore(RECIPE_STORE).put(recipe)
  if (photoUpdate.kind === 'replace') {
    photos.put({ recipeId: recipe.id, variant: 'full', blob: photoUpdate.photo.full } satisfies RecipePhotoRecord)
    photos.put({ recipeId: recipe.id, variant: 'thumbnail', blob: photoUpdate.photo.thumbnail } satisfies RecipePhotoRecord)
  } else if (photoUpdate.kind === 'remove') {
    photos.delete([recipe.id, 'full'])
    photos.delete([recipe.id, 'thumbnail'])
  }
  await transactionComplete(transaction)
  return recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([RECIPE_STORE, PHOTO_STORE], 'readwrite')
  transaction.objectStore(RECIPE_STORE).delete(id)
  transaction.objectStore(PHOTO_STORE).delete([id, 'full'])
  transaction.objectStore(PHOTO_STORE).delete([id, 'thumbnail'])
  await transactionComplete(transaction)
}

export async function replaceLibrary(recipes: Recipe[], photos: RecipePhotoRecord[]): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction([RECIPE_STORE, PHOTO_STORE], 'readwrite')
  const recipeStore = transaction.objectStore(RECIPE_STORE)
  const photoStore = transaction.objectStore(PHOTO_STORE)
  try {
    recipeStore.clear()
    photoStore.clear()
    recipes.forEach((recipe) => recipeStore.put(recipe))
    photos.forEach((photo) => photoStore.put(photo))
  } catch (error) {
    transaction.abort()
    throw error
  }
  await transactionComplete(transaction)
}
