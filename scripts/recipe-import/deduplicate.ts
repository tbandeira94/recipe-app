export function normalizedUrlKey(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.hostname = url.hostname.toLocaleLowerCase()
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = ''
  if (url.pathname === '/') url.pathname = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  return url.toString().replace(/\/$/, '')
}
