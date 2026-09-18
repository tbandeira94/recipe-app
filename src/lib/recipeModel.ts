import type { Ingredient, Recipe, RecipeDraft } from '../types'
import { normalizeIngredientName, uniqueLabels, uniqueStrings } from './normalize'

export interface RecipeMaterializationOptions {
  id?: string
  now?: string
  idFactory?: () => string
}

/**
 * Produces the exact stored recipe shape from an editable draft. Keeping this
 * separate from IndexedDB lets local tools use the same normalization rules.
 */
export function materializeRecipe(draft: RecipeDraft, options: RecipeMaterializationOptions = {}): Recipe {
  const now = options.now ?? new Date().toISOString()
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const ingredients: Ingredient[] = draft.ingredients
    .map((ingredient) => ({
      ...ingredient,
      id: ingredient.id || idFactory(),
      name: ingredient.name.trim(),
      normalizedName: normalizeIngredientName(ingredient.name),
      quantity: ingredient.quantity.trim(),
      unit: ingredient.unit.trim(),
    }))
    .filter((ingredient) => ingredient.name)

  return {
    ...draft,
    id: options.id ?? idFactory(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    photoDataUrl: draft.photoDataUrl ?? null,
    ingredients,
    ingredientNames: uniqueStrings(ingredients.map((ingredient) => ingredient.normalizedName)),
    instructions: draft.instructions.map((step) => step.trim()).filter(Boolean),
    dishTypes: uniqueLabels(draft.dishTypes),
    mealTypes: [...new Set(draft.mealTypes)],
    tags: uniqueLabels(draft.tags),
    favorite: draft.favorite,
    notes: draft.notes.trim(),
    sourceName: draft.sourceName.trim(),
    sourceUrl: draft.sourceUrl.trim(),
    createdAt: options.now ?? now,
    modifiedAt: options.now ?? now,
  }
}
