import { describe, expect, it, vi } from 'vitest'
import type { Recipe } from '../../src/types'
import { convertUrls } from './batch'

const existingRecipe = (sourceUrl: string): Recipe => ({
  id: 'existing', name: 'Existing', description: '', hasPhoto: false, ingredients: [], ingredientNames: [], instructions: ['Cook.'],
  prepMinutes: null, cookMinutes: null, servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false,
  notes: '', sourceName: '', sourceUrl, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
})

describe('recipe batch deduplication', () => {
  it('uses recipes loaded from a base archive to skip matching source URLs before fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const results = await convertUrls(
      ['https://EXAMPLE.test/recipe?utm_source=saved'],
      1,
      [existingRecipe('https://example.test/recipe')],
    )
    expect(results).toEqual([{
      status: 'duplicate', inputUrl: 'https://EXAMPLE.test/recipe?utm_source=saved', duplicateOf: 'https://example.test/recipe', reason: 'Same normalized input URL.',
    }])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
