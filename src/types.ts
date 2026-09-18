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
  hasPhoto: boolean
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

export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'modifiedAt' | 'ingredientNames' | 'hasPhoto'>

export interface PreparedRecipePhoto {
  full: Blob
  thumbnail: Blob
}

export type PhotoUpdate =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; photo: PreparedRecipePhoto }

export type RecipePhotoVariant = 'full' | 'thumbnail'

export type ImportWarningField = 'name' | 'description' | 'ingredients' | 'instructions' | 'details'

export interface ImportWarning {
  field: ImportWarningField
  index?: number
  message: string
}

export interface RecipeImportSource {
  sourceName: string
  sourceUrl: string
}

export interface RecipeImportResult {
  draft: RecipeDraft
  warnings: ImportWarning[]
}

export interface RecipeArchivePhoto {
  recipeId: string
  full: string
  thumbnail: string
}

export interface RecipeArchiveManifest {
  format: 'pantry-book-archive'
  version: 1
  exportedAt: string
  recipes: Recipe[]
  photos: RecipeArchivePhoto[]
}
