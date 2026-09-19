import { useEffect, useRef, useState, type ReactNode } from 'react'

const BATCH_SIZE = 40

interface Props<T> {
  items: T[]
  itemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  label: string
  initialLimit?: number
  onLimitChange?: (limit: number) => void
}

export function ProgressiveList<T>({ items, itemKey, renderItem, label, initialLimit = BATCH_SIZE, onLimitChange }: Props<T>) {
  const [limit, setLimit] = useState(() => Math.max(BATCH_SIZE, initialLimit))
  const sentinel = useRef<HTMLDivElement>(null)
  const hasObserver = typeof IntersectionObserver !== 'undefined'
  const hasMore = limit < items.length

  useEffect(() => { onLimitChange?.(limit) }, [limit, onLimitChange])

  useEffect(() => {
    if (!hasObserver || !hasMore || !sentinel.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit((current) => Math.min(current + BATCH_SIZE, items.length))
    }, { rootMargin: '800px 0px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasMore, hasObserver, items.length])

  return <section className="recipe-list" aria-label="Recipes">
    <p className="count-label">{items.length} {label}</p>
    {items.slice(0, limit).map((item) => <div className="progressive-list-item" key={itemKey(item)}>{renderItem(item)}</div>)}
    {hasMore && <div ref={sentinel} className="list-sentinel" aria-hidden={hasObserver}>
      {!hasObserver && <button type="button" className="secondary-button" onClick={() => setLimit((current) => Math.min(current + BATCH_SIZE, items.length))}>Load more</button>}
    </div>}
  </section>
}
