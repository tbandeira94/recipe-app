import type { Recipe } from '../types'
import { normalizeIngredientName, normalizeSearchText, uniqueStrings } from './normalize'

export type MatchMode = 'all' | 'any'

export interface RecipeMatch {
  recipe: Recipe
  matchedIngredients: string[]
  missingIngredients: string[]
  score: number
}

export interface TextRecipeMatch {
  recipe: Recipe
  score: number
}

export function searchRecipes(recipes: Recipe[], query: string): TextRecipeMatch[] {
  const normalizedQuery = normalizeSearchText(query)
  const terms = uniqueStrings(normalizedQuery.split(/\s+/))
  if (!terms.length) return []

  return recipes
    .map((recipe) => {
      const fields = [
        { values: [recipe.name], weight: 8 },
        { values: [...recipe.tags, ...recipe.dishTypes, ...recipe.mealTypes], weight: 5 },
        { values: recipe.ingredients.map((ingredient) => ingredient.name), weight: 3 },
        { values: [recipe.description], weight: 1 },
      ].map((field) => ({ ...field, values: field.values.map(normalizeSearchText) }))

      let score = 0
      for (const term of terms) {
        const fieldScore = Math.max(0, ...fields.map((field) => field.values.some((value) => value.includes(term)) ? field.weight : 0))
        if (!fieldScore) return { recipe, score: -1 }
        score += fieldScore
      }
      if (normalizeSearchText(recipe.name).includes(normalizedQuery)) score += 5
      return { recipe, score }
    })
    .filter((match) => match.score >= 0)
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name))
}

// Kept pure and separate from the UI so fuzzy matching or weighted ranking can replace it later.
export function searchRecipesByIngredients(
  recipes: Recipe[],
  ingredientQueries: string[],
  mode: MatchMode = 'all',
): RecipeMatch[] {
  const queries = uniqueStrings(ingredientQueries.map(normalizeIngredientName))
  if (!queries.length) return []

  return recipes
    .map((recipe) => {
      const matchedIngredients = queries.filter((query) =>
        recipe.ingredientNames.some((name) => name === query || name.includes(query) || query.includes(name)),
      )
      const missingIngredients = queries.filter((query) => !matchedIngredients.includes(query))
      return { recipe, matchedIngredients, missingIngredients, score: matchedIngredients.length / queries.length }
    })
    .filter((match) => (mode === 'all' ? match.missingIngredients.length === 0 : match.matchedIngredients.length > 0))
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name))
}
