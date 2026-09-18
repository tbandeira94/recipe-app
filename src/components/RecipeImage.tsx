import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RecipePhotoVariant } from '../types'
import { getRecipePhoto } from '../lib/database'

const MAX_CONCURRENT_LOADS = 4
let activeLoads = 0
const pendingLoads: Array<() => void> = []

async function loadAndDecodePhoto(recipeId: string, variant: RecipePhotoVariant): Promise<string | undefined> {
  const blob = await getRecipePhoto(recipeId, variant)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.src = url
  try {
    if (image.decode) await image.decode()
    else await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image could not be decoded.')) })
    return url
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function schedulePhotoLoad(recipeId: string, variant: RecipePhotoVariant): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeLoads += 1
      loadAndDecodePhoto(recipeId, variant)
        .then(resolve, reject)
        .finally(() => {
          activeLoads -= 1
          pendingLoads.shift()?.()
        })
    }
    if (activeLoads < MAX_CONCURRENT_LOADS) run()
    else pendingLoads.push(run)
  })
}

interface Props {
  recipeId: string
  variant: RecipePhotoVariant
  className: string
  placeholder: ReactNode
  eager?: boolean
  alt?: string
}

export function RecipeImage({ recipeId, variant, className, placeholder, eager = false, alt = '' }: Props) {
  const container = useRef<HTMLSpanElement>(null)
  const [nearby, setNearby] = useState(eager || typeof IntersectionObserver === 'undefined')
  const [source, setSource] = useState<{ key: string; url: string } | null>(null)
  const sourceKey = `${recipeId}:${variant}`

  useEffect(() => {
    if (eager || typeof IntersectionObserver === 'undefined') return
    const element = container.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      setNearby(entry.isIntersecting)
      if (!entry.isIntersecting) setSource((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return null
      })
    }, { rootMargin: '800px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [eager])

  useEffect(() => {
    if (!nearby) return
    let cancelled = false
    let objectUrl: string | null = null
    void schedulePhotoLoad(recipeId, variant).then((url) => {
      if (!url) return
      if (cancelled) { URL.revokeObjectURL(url); return }
      objectUrl = url
      setSource({ key: sourceKey, url: objectUrl })
    }).catch(() => undefined)
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [nearby, recipeId, sourceKey, variant])

  return <span ref={container} className={`${className} recipe-image-shell`}>
    {source?.key === sourceKey ? <img src={source.url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setSource((current) => { if (current) URL.revokeObjectURL(current.url); return null })} /> : placeholder}
  </span>
}

export function BlobImage({ blob, className, alt = '' }: { blob: Blob; className: string; alt?: string }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    let active = true
    queueMicrotask(() => { if (active) setSource(url) })
    return () => { active = false; URL.revokeObjectURL(url) }
  }, [blob])
  return source ? <img src={source} className={className} alt={alt} decoding="async" /> : null
}
