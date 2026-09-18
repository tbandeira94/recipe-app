export interface Ingredient {
  id: string
  name: string
  normalizedName: string
  quantity: string
  unit: string
}

export const MEAL_TYPES = ['breakfast', 'brunch', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export interface Recipe {
  id: string
  name: string
  description: string
  photoDataUrl: string | null
  ingredients: Ingredient[]
  ingredientNames: string[]
  instructions: string[]
  prepMinutes: number | null
  cookMinutes: number | null
  servings: number | null
  dishTypes: string[]
  mealTypes: MealType[]
  tags: string[]
  favorite: boolean
  notes: string
  sourceName: string
  sourceUrl: string
  createdAt: string
  modifiedAt: string
}

export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'modifiedAt' | 'ingredientNames'>

export interface RecipeBackup {
  format: 'pantry-book-backup'
  version: 3
  exportedAt: string
  recipes: Recipe[]
}
