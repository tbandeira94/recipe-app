import { MEAL_TYPES, type Ingredient, type Recipe, type RecipeBackup } from '../types'
import { normalizeIngredientName, uniqueStrings } from './normalize'

export const BACKUP_FORMAT = 'pantry-book-backup'
export const BACKUP_VERSION = 3

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function isPhotoDataUrl(value: unknown): value is string | null {
  return value === null || (isString(value) && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
}

function validateIngredient(value: unknown): value is Ingredient {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'name', 'quantity', 'unit'].every((key) => isString(item[key]))
}

function validateRecipe(value: unknown, hasPhoto: boolean): value is Recipe {
  if (!value || typeof value !== 'object') return false
  const recipe = value as Record<string, unknown>
  const strings = ['id', 'name', 'description', 'notes', 'sourceName', 'sourceUrl', 'createdAt', 'modifiedAt']
  return strings.every((key) => isString(recipe[key])) && recipe.name !== '' &&
    (!hasPhoto || isPhotoDataUrl(recipe.photoDataUrl)) &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.every(validateIngredient) &&
    Array.isArray(recipe.instructions) && recipe.instructions.every(isString) &&
    Array.isArray(recipe.dishTypes) && recipe.dishTypes.every(isString) &&
    Array.isArray(recipe.mealTypes) && recipe.mealTypes.every((value) => isString(value) && MEAL_TYPES.includes(value as (typeof MEAL_TYPES)[number])) &&
    Array.isArray(recipe.tags) && recipe.tags.every(isString) &&
    typeof recipe.favorite === 'boolean' &&
    isNullableNumber(recipe.prepMinutes) && isNullableNumber(recipe.cookMinutes) && isNullableNumber(recipe.servings) &&
    !Number.isNaN(Date.parse(recipe.createdAt as string)) && !Number.isNaN(Date.parse(recipe.modifiedAt as string))
}

/** Validates a restore file and restores fields derived by the app. */
export function parseBackup(text: string): RecipeBackup {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not valid JSON.') }
  if (!value || typeof value !== 'object') throw new Error('This file is not a Pantry Book backup.')
  const backup = value as Record<string, unknown>
  if (backup.format !== BACKUP_FORMAT) throw new Error('This file is not a Pantry Book backup.')
  if (backup.version !== 2 && backup.version !== BACKUP_VERSION) throw new Error(`Backup version ${String(backup.version)} is not supported.`)
  if (!isString(backup.exportedAt) || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('The backup date is invalid.')
  const hasPhotos = backup.version === BACKUP_VERSION
  if (!Array.isArray(backup.recipes) || !backup.recipes.every((recipe) => validateRecipe(recipe, hasPhotos))) throw new Error('One or more recipes are invalid.')

  const ids = new Set<string>()
  const recipes = backup.recipes.map((recipe) => {
    if (ids.has(recipe.id)) throw new Error('The backup contains duplicate recipe IDs.')
    ids.add(recipe.id)
    const ingredients = recipe.ingredients.map((ingredient) => ({ ...ingredient, normalizedName: normalizeIngredientName(ingredient.name) }))
    return { ...recipe, photoDataUrl: hasPhotos ? recipe.photoDataUrl : null, ingredients, ingredientNames: uniqueStrings(ingredients.map((item) => item.normalizedName)) }
  })
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: backup.exportedAt, recipes }
}

export function createBackupFromRecipes(recipes: Recipe[], exportedAt = new Date().toISOString()): RecipeBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, recipes }
}
