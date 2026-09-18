import type { ImportWarning, RecipeDraft, RecipeImportResult, RecipeImportSource } from '../types'
import { parseIngredientLine } from './ingredientParser'

const EMPTY_SOURCE: RecipeImportSource = { sourceName: '', sourceUrl: '' }
const ingredientHeading = /^(?:ingredients?|ingredient checklist|what you(?:'|’)ll need|what you will need)(?:\s*\([^)]*\))?(?:\s*[-–—|]?\s*(?:1x\s+2x\s+3x|us customary(?:\s*[-–—|]\s*metric)?|metric))?\s*:?$/i
const instructionHeading = /^(?:(?:step[- ]by[- ]step|recipe)\s+)?(?:instructions?|directions?|method|preparation|procedure|steps?|how to make(?: it| this)?)(?:\s*\([^)]*\))?\s*:?$/i
const detailHeading = /^(?:details?|notes?|nutrition(?: information| facts)?|equipment|storage|substitutions?)\s*:?$/i
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
  return line.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

const listMarker = /^(?:(?:[-*•‣⁃▪▫◦–—·]\s+)|(?:[☐☑☒✓✔□▢]\s*))+/u

function hasListMarker(line: string): boolean {
  return listMarker.test(line)
}

function stripListMarker(line: string): string {
  return line.replace(listMarker, '').trim()
}

function stripHeadingDecoration(line: string): string {
  return stripListMarker(line).replace(/^#{1,6}\s*/, '').trim()
}

function isIngredientHeading(line: string): boolean {
  return ingredientHeading.test(stripHeadingDecoration(line))
}

function isInstructionHeading(line: string): boolean {
  return instructionHeading.test(stripHeadingDecoration(line))
}

function isDetailHeading(line: string): boolean {
  return detailHeading.test(stripHeadingDecoration(line))
}

function splitInlineSection(line: string): string[] {
  const match = line.match(/^(.+?)\s*:\s+(.+)$/)
  return match && (isIngredientHeading(match[1]) || isInstructionHeading(match[1])) ? [match[1], match[2]] : [line]
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

function isRecipeCardControl(line: string): boolean {
  const cleaned = stripHeadingDecoration(line)
  return /^\[button:\s*us customary\]\s*\[button:\s*metric\]$/i.test(cleaned)
    || /^(?:\[?button:?\s*)?(?:us customary|metric)(?:\]?\s*)$/i.test(cleaned)
    || /^(?:units?\s*:|us\s*customary\s*[-–—|]?\s*metric|metric\s*[-–—|]?\s*us\s*customary|metricus|(?:scale\s*)?1x\s+2x\s+3x)$/i.test(cleaned)
    || /^(?:cook mode\b.*|prevent your screen from going dark|keep (?:the )?screen awake.*)$/i.test(cleaned)
}

function isNutritionBoundary(line: string): boolean {
  return /^nutrition(?: information| facts)?\s*:\s*.+$/i.test(stripHeadingDecoration(line))
    || /^(?:nutrition information|nutrition facts)$/i.test(stripHeadingDecoration(line))
}

function isDiscardedRecipeCardLine(line: string): boolean {
  const cleaned = stripHeadingDecoration(line)
  return isRecipeCardControl(cleaned) || /^image\s*:/i.test(cleaned) || /^nutrition(?: information| facts)?\s*$/i.test(cleaned)
}

function ingredientLines(block: string[]): string[] {
  const usable: string[] = []
  let sawIngredient = false
  for (const line of block) {
    if (isNutritionBoundary(line) && sawIngredient) break
    if (!line || isDiscardedRecipeCardLine(line)) continue
    usable.push(line)
    sawIngredient = true
  }
  const bulletMode = usable.some(hasListMarker)
  if (!bulletMode) return usable.map(stripHeadingDecoration)

  const combined: string[] = []
  for (const line of usable) {
    const cleaned = stripHeadingDecoration(line)
    if (!cleaned) continue
    if (hasListMarker(line) || subsectionHeading.test(cleaned) || !combined.length) combined.push(cleaned)
    else combined[combined.length - 1] = `${combined[combined.length - 1]}, ${cleaned}`
  }
  return combined
}

function stripInstructionMarker(line: string): string {
  return stripHeadingDecoration(line)
    .replace(/^(?:step\s*)?\d+(?:\s+of\s+\d+)?\s*[.):\-–—]?\s*/i, '')
    .trim()
}

/** Parses intentionally copied recipe text without fetching or sending it anywhere. */
export function parseRecipeText(text: string, source: RecipeImportSource = EMPTY_SOURCE): RecipeImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(cleanLine).flatMap(splitInlineSection)
  const nonEmpty = lines.map((line, index) => ({ line, index })).filter(({ line }) => Boolean(line))
  if (!nonEmpty.length) throw new Error('Paste a recipe before reviewing the import.')

  const warnings: ImportWarning[] = []
  const draft = emptyDraft(source)
  const ingredientIndex = lines.findIndex(isIngredientHeading)
  const instructionIndex = lines.findIndex((line, index) => index > ingredientIndex && isInstructionHeading(line))
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
    const end = instructionIndex > ingredientIndex ? instructionIndex : lines.length
    const parsedLines = ingredientLines(lines.slice(ingredientIndex + 1, end))
    draft.ingredients = parsedLines.map((line, index) => parseIngredientLine(stripListMarker(line), index, warnings))
    if (!draft.ingredients.length) warnings.push({ field: 'ingredients', message: 'No ingredient lines were found below the Ingredients heading.' })
  }

  if (instructionIndex < 0) {
    warnings.push({ field: 'instructions', message: 'No Instructions, Directions, Method, or Preparation heading was found. Add steps before saving.' })
  } else {
    const laterDetailIndex = lines.slice(instructionIndex + 1).findIndex(isDetailHeading)
    const end = laterDetailIndex >= 0 ? instructionIndex + 1 + laterDetailIndex : lines.length
    draft.instructions = lines.slice(instructionIndex + 1, end)
      .filter((line) => line && !isDiscardedRecipeCardLine(line) && !isRecipeCardControl(line))
      .map(stripInstructionMarker).filter(Boolean)
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
