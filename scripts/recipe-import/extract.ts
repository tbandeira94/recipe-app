import type { ExtractedRecipe, ImageCandidate } from './types'

function attributeValue(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim()
}

function recipeType(value: unknown): boolean {
  const types = Array.isArray(value) ? value : [value]
  return types.some((item) => typeof item === 'string' && item.toLocaleLowerCase() === 'recipe')
}

function walk(value: unknown, results: Record<string, unknown>[]): void {
  if (Array.isArray(value)) { value.forEach((item) => walk(item, results)); return }
  if (!value || typeof value !== 'object') return
  const item = value as Record<string, unknown>
  if (recipeType(item['@type'])) results.push(item)
  if (Array.isArray(item['@graph'])) item['@graph'].forEach((child) => walk(child, results))
}

function candidateScore(candidate: Record<string, unknown>): number {
  const count = (key: string) => Array.isArray(candidate[key]) ? candidate[key].length : candidate[key] ? 1 : 0
  return (candidate.name ? 8 : 0) + count('recipeIngredient') * 2 + count('recipeInstructions') * 2 +
    (candidate.description ? 1 : 0) + (candidate.prepTime ? 1 : 0) + (candidate.cookTime ? 1 : 0) + (candidate.recipeYield ? 1 : 0)
}

function jsonLdCandidates(html: string): { candidates: Record<string, unknown>[]; malformed: number } {
  const candidates: Record<string, unknown>[] = []
  let malformed = 0
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (const match of html.matchAll(scripts)) {
    const type = attributeValue(match[1], 'type')?.toLocaleLowerCase()
    if (type !== 'application/ld+json') continue
    const text = match[2].trim().replace(/^<!--\s*|\s*-->$/g, '').replace(/;\s*$/, '')
    try { walk(JSON.parse(text), candidates) } catch { malformed += 1 }
  }
  return { candidates, malformed }
}

function metaContent(html: string, key: string): string | undefined {
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = match[1]
    const identity = attributeValue(attributes, 'property') ?? attributeValue(attributes, 'name')
    if (identity?.toLocaleLowerCase() === key.toLocaleLowerCase()) return attributeValue(attributes, 'content')?.trim()
  }
  return undefined
}

function itempropValues(html: string, property: string): string[] {
  const values: string[] = []
  const tagPattern = /<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
  for (const match of html.matchAll(tagPattern)) {
    if (attributeValue(match[2], 'itemprop') !== property) continue
    const content = attributeValue(match[2], 'content') ?? stripHtml(match[3])
    if (content) values.push(content)
  }
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    if (attributeValue(match[1], 'itemprop') !== property) continue
    const content = attributeValue(match[1], 'content')
    if (content) values.push(content)
  }
  return values
}

function htmlFallback(html: string): Record<string, unknown> | undefined {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const documentTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = metaContent(html, 'og:title') ?? (heading ? stripHtml(heading) : undefined) ?? (documentTitle ? stripHtml(documentTitle) : undefined)
  const ingredients = itempropValues(html, 'recipeIngredient')
  const instructions = itempropValues(html, 'recipeInstructions')
  if (!title && !ingredients.length && !instructions.length) return undefined
  return {
    '@type': 'Recipe', name: title ?? '', description: metaContent(html, 'og:description') ?? metaContent(html, 'description') ?? '',
    recipeIngredient: ingredients, recipeInstructions: instructions,
    publisher: { name: metaContent(html, 'og:site_name') ?? '' },
  }
}

export function extractRecipe(html: string): { extracted?: ExtractedRecipe; warnings: string[] } {
  const { candidates, malformed } = jsonLdCandidates(html)
  const warnings = malformed ? [`Ignored ${malformed} malformed JSON-LD block${malformed === 1 ? '' : 's'}.`] : []
  if (candidates.length) {
    candidates.sort((a, b) => candidateScore(b) - candidateScore(a))
    return { extracted: { recipe: candidates[0], source: 'json-ld', candidateCount: candidates.length }, warnings }
  }
  const fallback = htmlFallback(html)
  if (fallback) return { extracted: { recipe: fallback, source: 'html-fallback', candidateCount: 1 }, warnings: [...warnings, 'No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback.'] }
  return { warnings }
}

export function canonicalUrlFromHtml(html: string, responseUrl: string): string {
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = attributeValue(match[1], 'rel')?.toLocaleLowerCase().split(/\s+/) ?? []
    const href = attributeValue(match[1], 'href')
    if (rel.includes('canonical') && href) {
      try { return new URL(href, responseUrl).toString() } catch { return responseUrl }
    }
  }
  return responseUrl
}

function imageUrls(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim()].filter(Boolean)
  if (Array.isArray(value)) return value.flatMap(imageUrls)
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  return [item.url, item.contentUrl].flatMap(imageUrls)
}

function resolvedHttpUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl)
    return /^https?:$/i.test(url.protocol) ? url.toString() : undefined
  } catch { return undefined }
}

/** Returns ordered image candidates without downloading them. */
export function recipeImageCandidates(recipe: Record<string, unknown>, html: string, pageUrl: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = []
  const add = (url: string, source: ImageCandidate['source']) => {
    const resolved = resolvedHttpUrl(url, pageUrl)
    if (resolved && !candidates.some((candidate) => candidate.url === resolved)) candidates.push({ url: resolved, source })
  }
  imageUrls(recipe.image).forEach((url) => add(url, 'recipe-image'))
  const socialImage = metaContent(html, 'og:image')
  if (socialImage) add(socialImage, 'og-image')
  return candidates
}
