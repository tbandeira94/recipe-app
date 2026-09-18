import type { Recipe } from '../../src/types'
import { canonicalUrlFromHtml, extractRecipe } from './extract'
import { convertRecipe } from './convert'
import { normalizedUrlKey } from './deduplicate'
import { fetchRecipePage } from './fetchPage'
import type { BatchResult } from './types'

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export async function convertUrl(inputUrl: string): Promise<BatchResult> {
  try { new URL(inputUrl) } catch { return { status: 'failure', inputUrl, stage: 'input', message: 'Not a valid URL.' } }
  if (!/^https?:/i.test(inputUrl)) return { status: 'failure', inputUrl, stage: 'input', message: 'Only http and https URLs are supported.' }
  let page
  try { page = await fetchRecipePage(inputUrl) } catch (error) { return { status: 'failure', inputUrl, stage: 'fetch', message: error instanceof Error ? error.message : 'Could not fetch page.' } }
  const sourceUrl = canonicalUrlFromHtml(page.html, page.responseUrl)
  const extraction = extractRecipe(page.html)
  if (!extraction.extracted) return { status: 'failure', inputUrl, stage: 'extract', message: extraction.warnings[0] ?? 'No Recipe JSON-LD or usable HTML recipe metadata was found.' }
  const converted = convertRecipe(extraction.extracted.recipe, sourceUrl, hostname(sourceUrl))
  converted.warnings.unshift(...extraction.warnings.map((message) => ({ code: 'extraction-warning', message })))
  if (!converted.recipe.name || !converted.recipe.ingredients.length || !converted.recipe.instructions.length) {
    return { status: 'failure', inputUrl, stage: 'convert', message: converted.warnings.map((warning) => warning.message).join(' ') || 'The page did not contain a complete recipe.' }
  }
  if (extraction.extracted.candidateCount > 1) converted.warnings.push({ code: 'multiple-recipe-candidates', message: `Selected the most complete Recipe JSON-LD object from ${extraction.extracted.candidateCount} candidates.` })
  return { status: 'success', inputUrl, sourceUrl, recipe: converted.recipe, warnings: converted.warnings, unmappedFields: converted.unmappedFields, raw: extraction.extracted.recipe }
}

export async function convertUrls(urls: string[], concurrency: number, existingRecipes: Recipe[] = []): Promise<BatchResult[]> {
  const results: BatchResult[] = Array(urls.length)
  const seen = new Map<string, string>()
  for (const recipe of existingRecipes) {
    if (!recipe.sourceUrl) continue
    try { seen.set(normalizedUrlKey(recipe.sourceUrl), recipe.sourceUrl) } catch { /* Existing source URLs are user data. */ }
  }
  let next = 0
  const worker = async () => {
    while (true) {
      const index = next++
      if (index >= urls.length) return
      const inputUrl = urls[index]
      let inputKey: string
      try { inputKey = normalizedUrlKey(inputUrl) } catch { results[index] = { status: 'failure', inputUrl, stage: 'input', message: 'Not a valid URL.' }; continue }
      const known = seen.get(inputKey)
      if (known) { results[index] = { status: 'duplicate', inputUrl, duplicateOf: known, reason: 'Same normalized input URL.' }; continue }
      seen.set(inputKey, inputUrl)
      const result = await convertUrl(inputUrl)
      if (result.status === 'success') {
        const sourceKey = normalizedUrlKey(result.sourceUrl)
        const duplicateOf = seen.get(sourceKey)
        if (duplicateOf && duplicateOf !== inputUrl) results[index] = { status: 'duplicate', inputUrl, duplicateOf, reason: 'Same canonical or redirected recipe URL.' }
        else { seen.set(sourceKey, result.sourceUrl); results[index] = result }
      } else results[index] = result
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, urls.length || 1)) }, worker))
  return results
}
