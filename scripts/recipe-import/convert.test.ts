import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parseBackup } from '../../src/lib/backupFormat'
import { convertRecipe } from './convert'
import { extractRecipe } from './extract'

describe('recipe webpage conversion', () => {
  it('extracts JSON-LD graphs, sections, fractions, and source data into a valid backup recipe', async () => {
    const html = await readFile(new URL('../../test-data/recipe-import/schema-graph.html', import.meta.url), 'utf8')
    const extracted = extractRecipe(html)
    expect(extracted.extracted?.candidateCount).toBe(1)
    const converted = convertRecipe(extracted.extracted!.recipe, 'https://example.test/pasta')
    expect(converted.recipe.ingredients.map(({ quantity, unit, name }) => ({ quantity, unit, name }))).toEqual([
      { quantity: '2 1/2', unit: 'cups', name: 'all-purpose flour' },
      { quantity: '1', unit: 'tbsp', name: 'olive oil, divided' },
      { quantity: '', unit: '', name: 'Salt and pepper to taste' },
    ])
    expect(converted.recipe.instructions).toEqual(['Make the sauce — Whisk the oil.', 'Serve warm.'])
    expect(converted.recipe).toMatchObject({ prepMinutes: 15, cookMinutes: 60, servings: 4, sourceName: 'Example Kitchen', sourceUrl: 'https://example.test/pasta', photoDataUrl: null })
    expect(converted.unmappedFields).toContain('image')
    expect(() => parseBackup(JSON.stringify({ format: 'pantry-book-backup', version: 3, exportedAt: new Date().toISOString(), recipes: [converted.recipe] }))).not.toThrow()
  })

  it('keeps malformed JSON-LD from blocking another usable recipe block', () => {
    const html = '<script type="application/ld+json">{bad json}</script><script type="application/ld+json">{"@type":"Recipe","name":"Toast","recipeIngredient":["1 slice bread"],"recipeInstructions":"Toast it."}</script>'
    const extracted = extractRecipe(html)
    expect(extracted.extracted?.recipe.name).toBe('Toast')
    expect(extracted.warnings[0]).toContain('malformed')
  })

  it('does not convert an ambiguous yield into a numeric serving count', () => {
    const converted = convertRecipe({ '@type': 'Recipe', name: 'Cookies', recipeIngredient: ['1 cup flour'], recipeInstructions: ['Bake.'], recipeYield: '2-4 dozen' }, 'https://example.test/cookies')
    expect(converted.recipe.servings).toBeNull()
    expect(converted.warnings.some((warning) => warning.code === 'unreadable-yield')).toBe(true)
  })
})
