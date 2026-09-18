import { MEAL_TYPES, type Ingredient, type Recipe, type RecipeArchiveManifest } from '../types'

export const ARCHIVE_FORMAT = 'pantry-book-archive'
export const ARCHIVE_VERSION = 1

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function isIngredient(value: unknown): value is Ingredient {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'name', 'normalizedName', 'quantity', 'unit'].every((key) => isString(item[key]))
}

function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false
  const recipe = value as Record<string, unknown>
  const strings = ['id', 'name', 'description', 'notes', 'sourceName', 'sourceUrl', 'createdAt', 'modifiedAt']
  return strings.every((key) => isString(recipe[key])) && recipe.name !== '' &&
    typeof recipe.hasPhoto === 'boolean' &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.every(isIngredient) &&
    Array.isArray(recipe.ingredientNames) && recipe.ingredientNames.every(isString) &&
    Array.isArray(recipe.instructions) && recipe.instructions.every(isString) &&
    Array.isArray(recipe.dishTypes) && recipe.dishTypes.every(isString) &&
    Array.isArray(recipe.mealTypes) && recipe.mealTypes.every((item) => isString(item) && MEAL_TYPES.includes(item as (typeof MEAL_TYPES)[number])) &&
    Array.isArray(recipe.tags) && recipe.tags.every(isString) &&
    typeof recipe.favorite === 'boolean' &&
    isNullableNumber(recipe.prepMinutes) && isNullableNumber(recipe.cookMinutes) && isNullableNumber(recipe.servings) &&
    !Number.isNaN(Date.parse(recipe.createdAt as string)) && !Number.isNaN(Date.parse(recipe.modifiedAt as string))
}

export function parseArchiveManifest(text: string): RecipeArchiveManifest {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not a Pantry Book archive.') }
  if (!value || typeof value !== 'object') throw new Error('This file is not a Pantry Book archive.')
  const manifest = value as Record<string, unknown>
  if (manifest.format !== ARCHIVE_FORMAT || manifest.version !== ARCHIVE_VERSION) throw new Error('This backup format is not supported.')
  if (!isString(manifest.exportedAt) || Number.isNaN(Date.parse(manifest.exportedAt))) throw new Error('The backup date is invalid.')
  if (!Array.isArray(manifest.recipes) || !manifest.recipes.every(isRecipe)) throw new Error('One or more recipes are invalid.')
  if (!Array.isArray(manifest.photos)) throw new Error('The backup photo index is invalid.')

  const recipeIds = new Set<string>()
  for (const recipe of manifest.recipes) {
    if (recipeIds.has(recipe.id)) throw new Error('The backup contains duplicate recipe IDs.')
    recipeIds.add(recipe.id)
  }
  const photoRecipeIds = new Set<string>()
  const paths = new Set<string>()
  for (const value of manifest.photos) {
    if (!value || typeof value !== 'object') throw new Error('The backup photo index is invalid.')
    const photo = value as Record<string, unknown>
    if (!isString(photo.recipeId) || !isString(photo.full) || !isString(photo.thumbnail)) throw new Error('The backup photo index is invalid.')
    if (!/^photos\/\d{6}-full\.jpg$/.test(photo.full) || !/^photos\/\d{6}-thumbnail\.jpg$/.test(photo.thumbnail)) throw new Error('The backup contains an invalid photo path.')
    if (!recipeIds.has(photo.recipeId) || photoRecipeIds.has(photo.recipeId) || paths.has(photo.full) || paths.has(photo.thumbnail)) throw new Error('The backup photo index contains duplicates or an unknown recipe.')
    photoRecipeIds.add(photo.recipeId)
    paths.add(photo.full)
    paths.add(photo.thumbnail)
  }
  for (const recipe of manifest.recipes) {
    if (recipe.hasPhoto !== photoRecipeIds.has(recipe.id)) throw new Error(`The photo index does not match “${recipe.name}”.`)
  }
  return manifest as unknown as RecipeArchiveManifest
}
