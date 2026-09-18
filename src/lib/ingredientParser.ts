import type { Ingredient, ImportWarning } from '../types'

const FRACTIONS = '¼½¾⅓⅔⅛⅜⅝⅞'
const quantityPart = `(?:(?:(?:about|approx(?:imately)?|scant|heaping|generous)\\s+)?(?:\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+|[${FRACTIONS}])?|\\d+\\/\\d+|[${FRACTIONS}]+))`
const quantityExpression = `${quantityPart}(?:\\s*(?:-|–|to)\\s*${quantityPart})?`
const units = [
  'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'teaspoon', 'teaspoons', 'tsp',
  'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs', 'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l', 'clove', 'cloves', 'can', 'cans', 'package', 'packages',
  'pkg', 'stick', 'sticks', 'slice', 'slices', 'pinch', 'pinches', 'dash', 'dashes', 'piece', 'pieces',
]
const unitExpression = `(?:${units.join('|')})\\.?`
const ingredientExpression = new RegExp(`^(${quantityExpression})(?:\\s*(${unitExpression}))?\\s+(.+)$`, 'i')
const quantityAtStart = new RegExp(`^${quantityExpression}`, 'i')
const subsectionHeading = /^(?:for(?: the)?\s+.+|.+\s*:\s*)$/i

export type IngredientIdFactory = () => string

/** Parses one ingredient conservatively; ambiguous input remains intact in name. */
export function parseIngredientLine(line: string, index: number, warnings: ImportWarning[], idFactory: IngredientIdFactory = () => crypto.randomUUID()): Ingredient {
  const original = line.trim()
  if (subsectionHeading.test(original)) {
    warnings.push({ field: 'ingredients', index, message: `“${original}” looks like an ingredient subsection. It was kept as an ingredient because recipes cannot yet be grouped.` })
    return { id: idFactory(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  const match = original.match(ingredientExpression)
  if (!match) {
    if (quantityAtStart.test(original)) warnings.push({ field: 'ingredients', index, message: `Couldn’t separate the amount from “${original}”. It was kept intact for review.` })
    return { id: idFactory(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  const [, quantity, unit = '', name] = match
  if (!name.trim()) {
    warnings.push({ field: 'ingredients', index, message: `Couldn’t separate the amount from “${original}”. Review this ingredient.` })
    return { id: idFactory(), quantity: '', unit: '', name: original, normalizedName: '' }
  }
  return { id: idFactory(), quantity: quantity.trim(), unit: unit.replace(/\.$/, '').trim(), name: name.trim(), normalizedName: '' }
}
