import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_MAX_INPUT_BYTES, PHOTO_OUTPUT_SIZE, PHOTO_THUMBNAIL_SIZE } from '../../src/lib/photoConfig'
import { convertUrl } from './batch'
import { recipeImageCandidates } from './extract'
import { downloadRecipePhoto } from './photo'

const originalFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = originalFetch })

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 1600, height: 800, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer()
}

function pageResponse(html: string, url: string): Response {
  const response = new Response(html, { headers: { 'content-type': 'text/html' } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('recipe image import', () => {
  it('uses Recipe.image variants before og:image and converts the selected photo to the Pantry Book JPEG shape', async () => {
    const candidates = recipeImageCandidates({ image: [{ '@type': 'ImageObject', contentUrl: '/recipe.jpg' }, 'https://cdn.example.test/second.jpg'] }, '<meta property="og:image" content="/social.jpg">', 'https://example.test/recipe')
    expect(candidates).toEqual([
      { url: 'https://example.test/recipe.jpg', source: 'recipe-image' },
      { url: 'https://cdn.example.test/second.jpg', source: 'recipe-image' },
      { url: 'https://example.test/social.jpg', source: 'og-image' },
    ])
    const image = await png()
    globalThis.fetch = vi.fn(async () => new Response(image as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })) as typeof fetch
    const imported = await downloadRecipePhoto(candidates)
    expect(imported.result).toMatchObject({ status: 'downloaded', sourceUrl: 'https://example.test/recipe.jpg', source: 'recipe-image' })
    expect(imported.photo).not.toBeNull()
    const [full, thumbnail] = await Promise.all([sharp(imported.photo!.full).metadata(), sharp(imported.photo!.thumbnail).metadata()])
    expect(full).toMatchObject({ format: 'jpeg', width: PHOTO_OUTPUT_SIZE, height: PHOTO_OUTPUT_SIZE })
    expect(thumbnail).toMatchObject({ format: 'jpeg', width: PHOTO_THUMBNAIL_SIZE, height: PHOTO_THUMBNAIL_SIZE })
  })

  it('falls back to og:image when Recipe.image cannot be downloaded', async () => {
    const candidates = recipeImageCandidates({ image: 'https://cdn.example.test/missing.jpg' }, '<meta property="og:image" content="https://example.test/social.png">', 'https://example.test/recipe')
    const image = await png()
    globalThis.fetch = vi.fn(async (input: string | URL) => String(input).includes('missing')
      ? new Response('not found', { status: 404 })
      : new Response(image as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })) as typeof fetch
    const imported = await downloadRecipePhoto(candidates)
    expect(imported.result).toMatchObject({ status: 'downloaded', source: 'og-image', sourceUrl: 'https://example.test/social.png' })
    expect(imported.result.attemptedUrls).toHaveLength(2)
  })

  it('marks a converted recipe as having a photo when both JPEG variants are prepared', async () => {
    const page = `<script type="application/ld+json">{"@type":"Recipe","name":"Photo Soup","recipeIngredient":["1 cup broth"],"recipeInstructions":["Simmer."],"image":"https://images.example.test/soup.png"}</script>`
    const image = await png()
    globalThis.fetch = vi.fn(async (input: string | URL) => String(input).includes('soup.png')
      ? new Response(image as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
      : pageResponse(page, 'https://example.test/soup')) as typeof fetch
    const result = await convertUrl('https://example.test/soup')
    expect(result.status).toBe('success')
    if (result.status !== 'success') return
    expect(result.recipe.hasPhoto).toBe(true)
    expect(result.photo).not.toBeNull()
  })

  it.each([
    ['wrong content type', () => new Response('<html>', { headers: { 'content-type': 'text/html' } })],
    ['oversized response', () => new Response('', { headers: { 'content-type': 'image/jpeg', 'content-length': String(PHOTO_MAX_INPUT_BYTES + 1) } })],
    ['undecodable response', () => new Response('not an image', { headers: { 'content-type': 'image/jpeg' } })],
    ['pixel limit', () => new Response('<svg width="10000" height="5000" xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'content-type': 'image/svg+xml' } })],
  ])('keeps photo null when the %s cannot be processed', async (_label, response) => {
    globalThis.fetch = vi.fn(async () => response()) as typeof fetch
    const imported = await downloadRecipePhoto([{ url: 'https://example.test/bad-image', source: 'recipe-image' }])
    expect(imported.photo).toBeNull()
    expect(imported.result.status).toBe('unavailable')
    expect(imported.result.attemptedUrls).toEqual(['https://example.test/bad-image'])
  })

  it('ignores unsafe image URLs and reports no usable candidate', () => {
    expect(recipeImageCandidates({ image: ['javascript:alert(1)', 'file:///private/image.jpg'] }, '', 'https://example.test/recipe')).toEqual([])
  })

  it('imports a complete recipe when its image cannot be downloaded', async () => {
    const page = `<script type="application/ld+json">{"@type":"Recipe","name":"Image Failure Soup","recipeIngredient":["1 cup broth"],"recipeInstructions":["Simmer."],"image":"https://images.example.test/missing.jpg"}</script>`
    globalThis.fetch = vi.fn(async (input: string | URL) => String(input).includes('missing.jpg')
      ? new Response('missing', { status: 404 })
      : pageResponse(page, 'https://example.test/soup')) as typeof fetch
    const result = await convertUrl('https://example.test/soup')
    expect(result.status).toBe('success')
    if (result.status !== 'success') return
    expect(result.recipe.hasPhoto).toBe(false)
    expect(result.photo).toBeNull()
    expect(result.image.status).toBe('unavailable')
    expect(result.warnings.some((warning) => warning.code === 'image-unavailable')).toBe(true)
  })
})
