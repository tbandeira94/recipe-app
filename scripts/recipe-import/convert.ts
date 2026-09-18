import { materializeRecipe } from '../../src/lib/recipeModel'
import { MEAL_TYPES, type MealType, type RecipeDraft } from '../../src/types'
import { parseIngredientLine } from '../../src/lib/ingredientParser'
import type { ConversionWarning, ConvertedRecipe } from './types'

const SUPPORTED_FIELDS = new Set(['@context', '@type', '@id', 'name', 'description', 'recipeIngredient', 'recipeInstructions', 'prepTime', 'cookTime', 'recipeYield', 'recipeCategory', 'recipeCuisine', 'keywords', 'publisher', 'author', 'url', 'image', 'totalTime'])

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(strings)
  if (typeof value === 'string' || typeof value === 'number') return [String(value).trim()].filter(Boolean)
  return []
}

function labels(value: unknown): string[] {
  return strings(value).flatMap((item) => item.split(/[,;]/)).map((item) => item.trim()).filter(Boolean)
}

function personName(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return personName(value[0])
  if (value && typeof value === 'object') return text((value as Record<string, unknown>).name)
  return ''
}

function durationMinutes(value: unknown, label: string, warnings: ConversionWarning[]): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?)?$/i)
  if (!match) { warnings.push({ code: 'unreadable-duration', message: `Could not read ${label} duration “${value}”.` }); return null }
  return Math.round((Number(match[1] ?? 0) * 1440) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0))
}

function servings(value: unknown, warnings: ConversionWarning[]): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  const raw = strings(value)[0]
  if (!raw) return null
  const match = raw.match(/^\s*(\d+(?:\.\d+)?)\s*(?:servings?|serves?|people|portions?)?\s*$/i)
  if (match) return Number(match[1])
  warnings.push({ code: 'unreadable-yield', message: `Could not convert recipe yield “${raw}” to a single numeric serving count.` })
  return null
}

function flattenInstructions(value: unknown, section = ''): string[] {
  if (typeof value === 'string') return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => section ? `${section} — ${item}` : item)
  if (Array.isArray(value)) return value.flatMap((item) => flattenInstructions(item, section))
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  const type = strings(item['@type']).map((entry) => entry.toLocaleLowerCase())
  if (type.includes('howtosection')) return flattenInstructions(item.itemListElement ?? item.steps ?? item.text, text(item.name) || section)
  if (type.includes('howtostep')) return flattenInstructions(item.text ?? item.name, section)
  return flattenInstructions(item.itemListElement ?? item.text ?? item.name, section)
}

export function convertRecipe(source: Record<string, unknown>, sourceUrl: string, fallbackSourceName = ''): ConvertedRecipe {
  const warnings: ConversionWarning[] = []
  const ingredientsRaw = strings(source.recipeIngredient)
  const ingredientWarnings: { field: 'ingredients'; index?: number; message: string }[] = []
  const ingredients = ingredientsRaw.map((line, index) => parseIngredientLine(line, index, ingredientWarnings))
  warnings.push(...ingredientWarnings.map((warning) => ({ code: 'ingredient-review', message: warning.message })))
  const instructionSectionPresent = JSON.stringify(source.recipeInstructions ?? '').includes('HowToSection')
  const instructions = flattenInstructions(source.recipeInstructions)
  if (instructionSectionPresent) warnings.push({ code: 'flattened-instruction-sections', message: 'Instruction sections were flattened because Pantry Book stores a single ordered step list.' })
  const categories = labels(source.recipeCategory)
  const tagValues = [...labels(source.recipeCuisine), ...labels(source.keywords)]
  const meals = [...new Set([...categories, ...tagValues].map((value) => value.toLocaleLowerCase()).filter((value): value is MealType => MEAL_TYPES.includes(value as MealType)))]
  const sourceName = personName(source.publisher) || fallbackSourceName || personName(source.author)
  const draft: RecipeDraft = {
    name: text(source.name), description: text(source.description), photoDataUrl: null, ingredients, instructions,
    prepMinutes: durationMinutes(source.prepTime, 'prep time', warnings), cookMinutes: durationMinutes(source.cookTime, 'cook time', warnings),
    servings: servings(source.recipeYield, warnings), dishTypes: categories, mealTypes: meals, tags: tagValues, favorite: false, notes: '', sourceName, sourceUrl,
  }
  if (!draft.name) warnings.push({ code: 'missing-name', message: 'No recipe name was found.' })
  if (!draft.ingredients.length) warnings.push({ code: 'missing-ingredients', message: 'No ingredients were found.' })
  if (!draft.instructions.length) warnings.push({ code: 'missing-instructions', message: 'No instructions were found.' })
  const unmappedFields = Object.keys(source).filter((key) => !SUPPORTED_FIELDS.has(key))
  if (source.image) unmappedFields.push('image')
  if (source.totalTime) unmappedFields.push('totalTime')
  return { recipe: materializeRecipe(draft), warnings, unmappedFields: [...new Set(unmappedFields)].sort() }
}
