import type { PhotoUpdate, Recipe, RecipeDraft, RecipePhotoVariant } from '../types'
import { materializeRecipe } from './recipeModel'

const DEFAULT_DATABASE_NAME = 'pantry-book'
const DATABASE_PREFIX = 'pantry-book-library-'
const DATABASE_VERSION = 3
const RECIPE_STORE = 'recipes'
const PHOTO_STORE = 'recipePhotos'
const ACTIVE_DATABASE_KEY = 'pantry-book.active-database'
const KNOWN_DATABASES_KEY = 'pantry-book.known-databases'
const RESTORE_LOCK_KEY = 'pantry-book.restore-lock'
const RESTORE_LOCK_MS = 60 * 60 * 1000
const TRANSACTION_TIMEOUT_MS = 30_000

export interface RecipePhotoRecord {
  recipeId: string
  variant: RecipePhotoVariant
  blob: Blob
}

export interface StagingLibrary {
  readonly name: string
  readonly lockToken: string
  database: IDBDatabase
  photoBatchesSinceCheckpoint: number
}

let databasePromise: Promise<IDBDatabase> | undefined
let databasePromiseName: string | undefined
let databaseStale = false

class TransactionTimeoutError extends Error {
  constructor() {
    super('Local storage stopped responding.')
    this.name = 'TransactionTimeoutError'
  }
}

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage }
  catch { return undefined }
}

function isValidDatabaseName(name: unknown): name is string {
  return name === DEFAULT_DATABASE_NAME || (typeof name === 'string' && /^pantry-book-library-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(name))
}

export function getActiveDatabaseName(): string {
  const value = browserStorage()?.getItem(ACTIVE_DATABASE_KEY)
  return isValidDatabaseName(value) ? value : DEFAULT_DATABASE_NAME
}

function getKnownDatabaseNames(): string[] {
  const storage = browserStorage()
  if (!storage) return [DEFAULT_DATABASE_NAME]
  let parsed: unknown
  try { parsed = JSON.parse(storage.getItem(KNOWN_DATABASES_KEY) ?? '[]') } catch { parsed = [] }
  const names = Array.isArray(parsed) ? parsed.filter(isValidDatabaseName) : []
  return [...new Set([DEFAULT_DATABASE_NAME, getActiveDatabaseName(), ...names])]
}

function setKnownDatabaseNames(names: string[]): void {
  const storage = browserStorage()
  if (!storage) throw new Error('Browser settings storage is unavailable. The restore cannot be safely activated.')
  storage.setItem(KNOWN_DATABASES_KEY, JSON.stringify([...new Set(names.filter(isValidDatabaseName))]))
}

function registerDatabaseName(name: string): void {
  if (!isValidDatabaseName(name)) throw new Error('The local library name is invalid.')
  setKnownDatabaseNames([...getKnownDatabaseNames(), name])
}

function unregisterDatabaseName(name: string): void {
  const storage = browserStorage()
  if (!storage) return
  storage.setItem(KNOWN_DATABASES_KEY, JSON.stringify(getKnownDatabaseNames().filter((candidate) => candidate !== name)))
}

interface RestoreLock {
  token: string
  databaseName: string
  expiresAt: number
}

function getRestoreLock(): RestoreLock | undefined {
  const storage = browserStorage()
  if (!storage) return undefined
  try {
    const value = JSON.parse(storage.getItem(RESTORE_LOCK_KEY) ?? 'null') as Partial<RestoreLock> | null
    if (!value || typeof value.token !== 'string' || !isValidDatabaseName(value.databaseName) || typeof value.expiresAt !== 'number') return undefined
    if (value.expiresAt <= Date.now()) {
      storage.removeItem(RESTORE_LOCK_KEY)
      return undefined
    }
    return value as RestoreLock
  } catch { return undefined }
}

function acquireRestoreLock(databaseName: string): string {
  const storage = browserStorage()
  if (!storage) throw new Error('Browser settings storage is unavailable. The restore cannot be safely started.')
  if (getRestoreLock()) throw new Error('Another Pantry Book restore is already running. Finish or close it before trying again.')
  const lock: RestoreLock = { token: crypto.randomUUID(), databaseName, expiresAt: Date.now() + RESTORE_LOCK_MS }
  storage.setItem(RESTORE_LOCK_KEY, JSON.stringify(lock))
  if (getRestoreLock()?.token !== lock.token) throw new Error('Another Pantry Book restore started at the same time. Try again after it finishes.')
  return lock.token
}

function refreshRestoreLock(staging: StagingLibrary): void {
  const storage = browserStorage()
  const lock = getRestoreLock()
  if (!storage || lock?.token !== staging.lockToken || lock.databaseName !== staging.name) throw new Error('This restore was superseded by another Pantry Book window. Your existing library is unchanged.')
  storage.setItem(RESTORE_LOCK_KEY, JSON.stringify({ ...lock, expiresAt: Date.now() + RESTORE_LOCK_MS }))
}

function releaseRestoreLock(token: string): void {
  const storage = browserStorage()
  if (storage && getRestoreLock()?.token === token) storage.removeItem(RESTORE_LOCK_KEY)
}

function normalizeStoredRecipe(recipe: Recipe): Recipe {
  return { ...recipe, hasPhoto: Boolean(recipe.hasPhoto) }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Database request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction, timeoutMs = TRANSACTION_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      action()
    }
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try { transaction.abort() } catch { /* The transaction may already be wedged or inactive. */ }
      reject(new TransactionTimeoutError())
    }, timeoutMs)
    transaction.oncomplete = () => finish(resolve)
    transaction.onerror = () => finish(() => reject(transaction.error ?? new Error('Database transaction failed.')))
    transaction.onabort = () => finish(() => reject(transaction.error ?? new Error('Database transaction was cancelled.')))
  })
}

async function runWriteTransaction(database: IDBDatabase, stores: string | string[], queue: (transaction: IDBTransaction) => void): Promise<void> {
  const transaction = database.transaction(stores, 'readwrite')
  const completion = transactionComplete(transaction)
  try { queue(transaction) }
  catch (error) {
    try { transaction.abort() } catch { /* Ignore a redundant abort. */ }
    void completion.catch(() => undefined)
    throw error
  }
  await completion
}

function createRecipeStore(database: IDBDatabase): void {
  const store = database.createObjectStore(RECIPE_STORE, { keyPath: 'id' })
  store.createIndex('modifiedAt', 'modifiedAt')
  store.createIndex('ingredientNames', 'ingredientNames', { multiEntry: true })
  store.createIndex('tags', 'tags', { multiEntry: true })
  store.createIndex('dishTypes', 'dishTypes', { multiEntry: true })
  store.createIndex('mealTypes', 'mealTypes', { multiEntry: true })
}

function openNamedDatabase(name: string): Promise<IDBDatabase> {
  if (!isValidDatabaseName(name)) return Promise.reject(new Error('The local library name is invalid.'))
  return new Promise((resolve, reject) => {
    let settled = false
    const request = indexedDB.open(name, DATABASE_VERSION)
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new TransactionTimeoutError())
    }, TRANSACTION_TIMEOUT_MS)
    request.onupgradeneeded = () => {
      const database = request.result
      // Version 3 intentionally replaces the old base64-photo schema. A new
      // staging database is empty, while an existing active v3 database does
      // not run this upgrade path.
      for (const storeName of [...database.objectStoreNames]) database.deleteObjectStore(storeName)
      createRecipeStore(database)
      const photos = database.createObjectStore(PHOTO_STORE, { keyPath: ['recipeId', 'variant'] })
      photos.createIndex('recipeId', 'recipeId')
    }
    request.onsuccess = () => {
      const database = request.result
      if (settled) {
        database.close()
        return
      }
      settled = true
      clearTimeout(timeout)
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(request.error ?? new Error('Could not open local storage.'))
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error('Close other Pantry Book tabs, then try again.'))
    }
  })
}

export function resetDatabaseConnection(): void {
  void databasePromise?.then((database) => database.close()).catch(() => undefined)
  databasePromise = undefined
  databasePromiseName = undefined
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databaseStale) return Promise.reject(new Error('The recipe library changed in another window. Reload Pantry Book to continue.'))
  const name = getActiveDatabaseName()
  if (!databasePromise || databasePromiseName !== name) {
    resetDatabaseConnection()
    databasePromiseName = name
    databasePromise = openNamedDatabase(name).catch((error) => {
      databasePromise = undefined
      databasePromiseName = undefined
      throw error
    })
  }
  return databasePromise
}

function assertWritableWindow(): void {
  if (databaseStale) throw new Error('The recipe library changed in another window. Reload Pantry Book to continue.')
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
  assertWritableWindow()
  const database = await openDatabase()
  const transaction = database.transaction(RECIPE_STORE, 'readwrite')
  const completion = transactionComplete(transaction)
  const store = transaction.objectStore(RECIPE_STORE)
  const recipe = await requestResult<Recipe | undefined>(store.get(id))
  if (!recipe) {
    try { transaction.abort() } catch { /* Ignore a redundant abort. */ }
    void completion.catch(() => undefined)
    throw new Error('Recipe not found.')
  }
  store.put({ ...normalizeStoredRecipe(recipe), favorite })
  await completion
}

export async function saveRecipe(draft: RecipeDraft, photoUpdate: PhotoUpdate, existing?: Recipe): Promise<Recipe> {
  assertWritableWindow()
  const hasPhoto = photoUpdate.kind === 'replace' ? true : photoUpdate.kind === 'remove' ? false : Boolean(existing?.hasPhoto)
  const now = new Date().toISOString()
  const recipe = {
    ...materializeRecipe(draft, { id: existing?.id, now, hasPhoto }),
    createdAt: existing?.createdAt ?? now,
  }
  const database = await openDatabase()
  await runWriteTransaction(database, [RECIPE_STORE, PHOTO_STORE], (transaction) => {
    const photos = transaction.objectStore(PHOTO_STORE)
    transaction.objectStore(RECIPE_STORE).put(recipe)
    if (photoUpdate.kind === 'replace') {
      photos.put({ recipeId: recipe.id, variant: 'full', blob: photoUpdate.photo.full } satisfies RecipePhotoRecord)
      photos.put({ recipeId: recipe.id, variant: 'thumbnail', blob: photoUpdate.photo.thumbnail } satisfies RecipePhotoRecord)
    } else if (photoUpdate.kind === 'remove') {
      photos.delete([recipe.id, 'full'])
      photos.delete([recipe.id, 'thumbnail'])
    }
  })
  return recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  assertWritableWindow()
  const database = await openDatabase()
  await runWriteTransaction(database, [RECIPE_STORE, PHOTO_STORE], (transaction) => {
    transaction.objectStore(RECIPE_STORE).delete(id)
    transaction.objectStore(PHOTO_STORE).delete([id, 'full'])
    transaction.objectStore(PHOTO_STORE).delete([id, 'thumbnail'])
  })
}

export async function createStagingLibrary(): Promise<StagingLibrary> {
  const name = `${DATABASE_PREFIX}${crypto.randomUUID()}`
  const lockToken = acquireRestoreLock(name)
  try {
    registerDatabaseName(name)
    return { name, lockToken, database: await openNamedDatabase(name), photoBatchesSinceCheckpoint: 0 }
  }
  catch (error) {
    releaseRestoreLock(lockToken)
    unregisterDatabaseName(name)
    throw error
  }
}

async function runStagingBatch(staging: StagingLibrary, queue: (transaction: IDBTransaction) => void): Promise<void> {
  refreshRestoreLock(staging)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await runWriteTransaction(staging.database, [RECIPE_STORE, PHOTO_STORE], queue)
      refreshRestoreLock(staging)
      return
    } catch (error) {
      if (!(error instanceof TransactionTimeoutError) || attempt === 1) {
        if (error instanceof TransactionTimeoutError) throw new Error('Local storage stopped responding. Your existing library is unchanged. Fully close Pantry Book, reopen it, and try the restore again.', { cause: error })
        throw error
      }
      staging.database.close()
      staging.database = await openNamedDatabase(staging.name)
      staging.photoBatchesSinceCheckpoint = 0
    }
  }
}

export async function stageRecipeBatch(staging: StagingLibrary, recipes: Recipe[]): Promise<void> {
  await runStagingBatch(staging, (transaction) => {
    const store = transaction.objectStore(RECIPE_STORE)
    recipes.forEach((recipe) => store.put(recipe))
  })
}

export async function stagePhotoBatch(staging: StagingLibrary, photos: RecipePhotoRecord[]): Promise<void> {
  await runStagingBatch(staging, (transaction) => {
    const store = transaction.objectStore(PHOTO_STORE)
    photos.forEach((photo) => store.put(photo))
  })
  staging.photoBatchesSinceCheckpoint += 1
  if (staging.photoBatchesSinceCheckpoint >= 5) await checkpointStagingLibrary(staging)
}

export async function checkpointStagingLibrary(staging: StagingLibrary): Promise<void> {
  if (staging.photoBatchesSinceCheckpoint === 0) return
  refreshRestoreLock(staging)
  staging.database.close()
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  staging.database = await openNamedDatabase(staging.name)
  staging.photoBatchesSinceCheckpoint = 0
  refreshRestoreLock(staging)
}

export async function verifyStagingLibrary(staging: StagingLibrary, expectedRecipes: number, expectedPhotos: number): Promise<void> {
  const transaction = staging.database.transaction([RECIPE_STORE, PHOTO_STORE], 'readonly')
  const completion = transactionComplete(transaction)
  const [recipes, photos] = await Promise.all([
    requestResult(transaction.objectStore(RECIPE_STORE).count()),
    requestResult(transaction.objectStore(PHOTO_STORE).count()),
  ])
  await completion
  if (recipes !== expectedRecipes || photos !== expectedPhotos) throw new Error('The restored library could not be verified. Your existing library is unchanged.')
}

function setActiveDatabaseName(name: string): void {
  if (!isValidDatabaseName(name)) throw new Error('The local library name is invalid.')
  const storage = browserStorage()
  if (!storage) throw new Error('Browser settings storage is unavailable. The restore cannot be safely activated.')
  storage.setItem(ACTIVE_DATABASE_KEY, name)
}

export async function activateStagingLibrary(staging: StagingLibrary, expectedRecipes: number): Promise<string> {
  assertWritableWindow()
  refreshRestoreLock(staging)
  const previousName = getActiveDatabaseName()
  staging.database.close()
  setActiveDatabaseName(staging.name)
  resetDatabaseConnection()
  try {
    const database = await openDatabase()
    const count = await requestResult(database.transaction(RECIPE_STORE, 'readonly').objectStore(RECIPE_STORE).count())
    if (count !== expectedRecipes) throw new Error('The restored library could not be reopened.')
    releaseRestoreLock(staging.lockToken)
    return previousName
  } catch (error) {
    setActiveDatabaseName(previousName)
    resetDatabaseConnection()
    throw error
  }
}

async function deleteNamedDatabase(name: string, timeoutMs = 3_000): Promise<boolean> {
  if (!isValidDatabaseName(name) || name === getActiveDatabaseName()) return false
  return new Promise((resolve) => {
    let settled = false
    const finish = (deleted: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (deleted) unregisterDatabaseName(name)
      resolve(deleted)
    }
    const timeout = setTimeout(() => finish(false), timeoutMs)
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => finish(true)
    request.onerror = () => finish(false)
    request.onblocked = () => finish(false)
  })
}

export async function discardStagingLibrary(staging: StagingLibrary): Promise<void> {
  staging.database.close()
  await deleteNamedDatabase(staging.name)
  releaseRestoreLock(staging.lockToken)
}

export async function cleanupInactiveDatabases(): Promise<void> {
  const active = getActiveDatabaseName()
  const locked = getRestoreLock()?.databaseName
  for (const name of getKnownDatabaseNames()) {
    if (name !== active && name !== locked) await deleteNamedDatabase(name)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== ACTIVE_DATABASE_KEY || !event.newValue || event.newValue === databasePromiseName) return
    databaseStale = true
    resetDatabaseConnection()
    window.dispatchEvent(new Event('pantry-book-library-changed'))
  })
}
