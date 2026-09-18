import type { Ingredient, ImportWarning, RecipeDraft, RecipeImportResult, RecipeImportSource } from '../types'

const EMPTY_SOURCE: RecipeImportSource = { sourceName: '', sourceUrl: '' }
const FRACTIONS = '¼½¾⅓⅔⅛⅜⅝⅞'
const quantityPart = `(?:\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+|[${FRACTIONS}])?|\\d+\\/\\d+|[${FRACTIONS}]+)`
const quantityExpression = `${quantityPart}(?:\\s*(?:-|–|to)\\s*${quantityPart})?`
const units = [
  'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'teaspoon', 'teaspoons', 'tsp',
  'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs', 'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l', 'clove', 'cloves', 'can', 'cans', 'package', 'packages',
  'pkg', 'stick', 'sticks', 'slice', 'slices', 'pinch', 'pinches', 'dash', 'dashes', 'piece', 'pieces',
]
const unitExpression = `(?:${units.join('|')})\\.?`
const ingredientExpression = new RegExp(`^(${quantityExpression})(?:\\s+(${unitExpression}))?\\s+(.+)$`, 'i')
const quantityAtStart = new RegExp(`^${quantityExpression}`, 'i')
const ingredientHeading = /^(?:ingredients?|what you(?:'|’)ll need)\s*:??$/i
const instructionHeading = /^(?:instructions?|directions?|method|preparation|steps?)\s*:??$/i
const detailHeading = /^(?:details?|notes?|nutrition(?: information)?|equipment)\s*:??$/i
const subsectionHeading = /^(?:for(?: the)?\s+.+|.+\s*:\s*)$/i
const prepLabels = ['prep time', 'preparation time', 'prep']
const cookLabels = ['cook time', 'cooking time', 'cook']
const totalLabels = ['total time', 'total']
const servingLabels = ['servings?', 'yield', 'serves?']

function emptyDraft(source: RecipeImportSource): RecipeDraft {
  return {
    name: '', description: '', photoDataUrl: null, ingredients: [], instructions: [], prepMinutes: null, cookMinutes: null,
    servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false, notes: '',
    sourceName: source.sourceName.trim(), sourceUrl: source.sourceUrl.trim(),
  }
}

function cleanLine(line: string): string {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripListMarker(line: string): string {
  return line.replace(/^(?:[-*•‣]\s+|\d+\s*[.)]\s+)/, '').trim()
}

function durationMinutes(value: string): number | null {
  const hours = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/gi)]
    .reduce((total, match) => total + Number(match[1].replace(',', '.')) * 60, 0)
  const minutes = [...value.matchAll(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/gi)]
    .reduce((total, match) => total + Number(match[1]), 0)
  if (hours || minutes) return Math.round(hours + minutes)
  const bareMinutes = value.match(/^\s*(\d+)\s*$/)
  return bareMinutes ? Number(bareMinutes[1]) : null
}

function detailValue(line: string, labels: string[]): string | null {
  const label = labels.join('|')
  const match = line.match(new RegExp(`^(?:${label})\\s*:?\\s*(.+)$`, 'i'))
  return match?.[1].trim() || null
}

function isDetailLine(line: string): boolean {
  return Boolean(detailValue(line, prepLabels) || detailValue(line, cookLabels) || detailValue(line, totalLabels) || detailValue(line, servingLabels))
}

function parseIngredient(line: string, index: number, warnings: ImportWarning[]): Ingredient {
  const original = stripListMarker(line)
  if (subsectionHeading.test(original)) {
    warnings.push({ field: 'ingredients', index, message: `“${original}” looks like an ingredient subsection. It was kept as an ingredient because recipes cannot yet be grouped.` })
    return { id: crypto.randomUUID(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  const match = original.match(ingredientExpression)
  if (!match) {
    if (quantityAtStart.test(original)) warnings.push({ field: 'ingredients', index, message: `Couldn’t separate the amount from “${original}”. It was kept intact for review.` })
    return { id: crypto.randomUUID(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  const [, quantity, unit = '', name] = match
  if (!name.trim()) {
    warnings.push({ field: 'ingredients', index, message: `Couldn’t separate the amount from “${original}”. Review this ingredient.` })
    return { id: crypto.randomUUID(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  return { id: crypto.randomUUID(), quantity: quantity.trim(), unit: unit.replace(/\.$/, '').trim(), name: name.trim(), normalizedName: '' }
}

/** Parses intentionally copied recipe text without fetching or sending it anywhere. */
export function parseRecipeText(text: string, source: RecipeImportSource = EMPTY_SOURCE): RecipeImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(cleanLine)
  const nonEmpty = lines.map((line, index) => ({ line, index })).filter(({ line }) => Boolean(line))
  if (!nonEmpty.length) throw new Error('Paste a recipe before reviewing the import.')

  const warnings: ImportWarning[] = []
  const draft = emptyDraft(source)
  const ingredientIndex = lines.findIndex((line) => ingredientHeading.test(line))
  const instructionIndex = lines.findIndex((line) => instructionHeading.test(line))
  const firstSectionIndex = [ingredientIndex, instructionIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? lines.length
  const titleIndex = lines.slice(0, firstSectionIndex).findIndex(Boolean)

  if (titleIndex >= 0) {
    draft.name = lines[titleIndex]
    const descriptionEnd = ingredientIndex >= 0 ? ingredientIndex : firstSectionIndex
    draft.description = lines.slice(titleIndex + 1, descriptionEnd).filter((line) => line && !isDetailLine(line)).join(' ')
  } else {
    warnings.push({ field: 'name', message: 'No recipe title was found. Add one before saving.' })
  }

  if (ingredientIndex < 0) {
    warnings.push({ field: 'ingredients', message: 'No Ingredients heading was found. Add ingredients in the editor before saving.' })
  } else {
    const end = [instructionIndex, lines.slice(ingredientIndex + 1).findIndex((line) => detailHeading.test(line)) + ingredientIndex + 1]
      .filter((index) => index > ingredientIndex).sort((a, b) => a - b)[0] ?? lines.length
    const ingredientLines = lines.slice(ingredientIndex + 1, end).filter(Boolean)
    draft.ingredients = ingredientLines.map((line, index) => parseIngredient(line, index, warnings))
    if (!draft.ingredients.length) warnings.push({ field: 'ingredients', message: 'No ingredient lines were found below the Ingredients heading.' })
  }

  if (instructionIndex < 0) {
    warnings.push({ field: 'instructions', message: 'No Instructions, Directions, Method, or Preparation heading was found. Add steps before saving.' })
  } else {
    const laterDetailIndex = lines.slice(instructionIndex + 1).findIndex((line) => detailHeading.test(line))
    const end = laterDetailIndex >= 0 ? instructionIndex + 1 + laterDetailIndex : lines.length
    draft.instructions = lines.slice(instructionIndex + 1, end).filter(Boolean).map(stripListMarker).filter(Boolean)
    if (!draft.instructions.length) warnings.push({ field: 'instructions', message: 'No instruction lines were found below the instructions heading.' })
  }

  let totalMinutes: number | null = null
  for (const line of lines) {
    const prep = detailValue(line, prepLabels)
    const cook = detailValue(line, cookLabels)
    const total = detailValue(line, totalLabels)
    const servings = detailValue(line, servingLabels)
    if (prep) {
      draft.prepMinutes = durationMinutes(prep)
      if (draft.prepMinutes === null) warnings.push({ field: 'details', message: `Couldn’t read the prep time “${prep}”.` })
    }
    if (cook) {
      draft.cookMinutes = durationMinutes(cook)
      if (draft.cookMinutes === null) warnings.push({ field: 'details', message: `Couldn’t read the cook time “${cook}”.` })
    }
    if (total) {
      totalMinutes = durationMinutes(total)
      if (totalMinutes === null) warnings.push({ field: 'details', message: `Couldn’t read the total time “${total}”.` })
    }
    if (servings) {
      const servingMatch = servings.match(/^\s*(\d+)\s*$/)
      if (servingMatch) draft.servings = Number(servingMatch[1])
      else warnings.push({ field: 'details', message: `Couldn’t read a single serving count from “${servings}”.` })
    }
  }
  if (totalMinutes !== null && draft.cookMinutes === null) {
    if (draft.prepMinutes !== null && totalMinutes >= draft.prepMinutes) draft.cookMinutes = totalMinutes - draft.prepMinutes
    else warnings.push({ field: 'details', message: 'Total time was not used because a usable prep time was not found.' })
  }

  return { draft, warnings }
}
