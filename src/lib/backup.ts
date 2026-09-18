import { MEAL_TYPES, type Ingredient, type Recipe, type RecipeBackup } from '../types'
import { normalizeIngredientName, uniqueStrings } from './normalize'
import { getRecipes, replaceAllRecipes } from './database'

const BACKUP_FORMAT = 'pantry-book-backup'
const BACKUP_VERSION = 2

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function validateIngredient(value: unknown): value is Ingredient {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'name', 'quantity', 'unit'].every((key) => isString(item[key]))
}

function validateRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false
  const recipe = value as Record<string, unknown>
  const strings = ['id', 'name', 'description', 'notes', 'sourceName', 'sourceUrl', 'createdAt', 'modifiedAt']
  return (
    strings.every((key) => isString(recipe[key])) &&
    recipe.name !== '' &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.every(validateIngredient) &&
    Array.isArray(recipe.instructions) && recipe.instructions.every(isString) &&
    Array.isArray(recipe.dishTypes) && recipe.dishTypes.every(isString) &&
    Array.isArray(recipe.mealTypes) && recipe.mealTypes.every((value) => isString(value) && MEAL_TYPES.includes(value as (typeof MEAL_TYPES)[number])) &&
    Array.isArray(recipe.tags) && recipe.tags.every(isString) &&
    typeof recipe.favorite === 'boolean' &&
    isNullableNumber(recipe.prepMinutes) &&
    isNullableNumber(recipe.cookMinutes) &&
    isNullableNumber(recipe.servings) &&
    !Number.isNaN(Date.parse(recipe.createdAt as string)) &&
    !Number.isNaN(Date.parse(recipe.modifiedAt as string))
  )
}

export function parseBackup(text: string): RecipeBackup {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!value || typeof value !== 'object') throw new Error('This file is not a Pantry Book backup.')
  const backup = value as Record<string, unknown>
  if (backup.format !== BACKUP_FORMAT) throw new Error('This file is not a Pantry Book backup.')
  if (backup.version !== BACKUP_VERSION) throw new Error(`Backup version ${String(backup.version)} is not supported.`)
  if (!isString(backup.exportedAt) || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('The backup date is invalid.')
  if (!Array.isArray(backup.recipes) || !backup.recipes.every(validateRecipe)) throw new Error('One or more recipes are invalid.')

  const ids = new Set<string>()
  const recipes = backup.recipes.map((recipe) => {
    if (ids.has(recipe.id)) throw new Error('The backup contains duplicate recipe IDs.')
    ids.add(recipe.id)
    const ingredients = recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      normalizedName: normalizeIngredientName(ingredient.name),
    }))
    return { ...recipe, ingredients, ingredientNames: uniqueStrings(ingredients.map((item) => item.normalizedName)) }
  })
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: backup.exportedAt, recipes }
}

export async function createBackup(): Promise<RecipeBackup> {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), recipes: await getRecipes() }
}

export async function exportBackup(): Promise<'shared' | 'downloaded'> {
  const backup = await createBackup()
  const date = backup.exportedAt.slice(0, 10)
  const filename = `recipes-backup-${date}.json`
  const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Pantry Book backup' })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export async function importBackup(file: File): Promise<number> {
  const parsed = parseBackup(await file.text())
  await replaceAllRecipes(parsed.recipes)
  return parsed.recipes.length
}
