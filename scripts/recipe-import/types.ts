import type { Recipe } from '../../src/types'

export interface ConversionWarning {
  code: string
  message: string
}

export interface ExtractedRecipe {
  recipe: Record<string, unknown>
  source: 'json-ld' | 'html-fallback'
  candidateCount: number
}

export interface ConvertedRecipe {
  recipe: Recipe
  warnings: ConversionWarning[]
  unmappedFields: string[]
}

export interface ImportedPhoto {
  full: Buffer
  thumbnail: Buffer
}

export interface ImageCandidate {
  url: string
  source: 'recipe-image' | 'og-image'
}

export type ImageImportResult =
  | { status: 'downloaded'; sourceUrl: string; source: ImageCandidate['source']; attemptedUrls: string[] }
  | { status: 'unavailable'; attemptedUrls: string[]; reason: string }

export type BatchResult =
  | { status: 'success'; inputUrl: string; sourceUrl: string; recipe: Recipe; photo: ImportedPhoto | null; image: ImageImportResult; warnings: ConversionWarning[]; unmappedFields: string[]; raw: Record<string, unknown> }
  | { status: 'duplicate'; inputUrl: string; duplicateOf: string; reason: string }
  | { status: 'failure'; inputUrl: string; stage: 'input' | 'fetch' | 'extract' | 'convert'; message: string }
