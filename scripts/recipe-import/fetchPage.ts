export interface FetchedPage {
  inputUrl: string
  responseUrl: string
  html: string
}

const MAX_BYTES = 5 * 1024 * 1024

export async function fetchRecipePage(inputUrl: string, timeoutMs = 20_000): Promise<FetchedPage> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(inputUrl, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': 'Pantry-Book-Recipe-Import/0.1 (personal local migration utility)', accept: 'text/html,application/xhtml+xml' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!/\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(contentType)) throw new Error(`Expected HTML but received ${contentType || 'an unknown content type'}.`)
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Page is larger than the 5 MB safety limit.')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response did not include a readable page body.')
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_BYTES) { await reader.cancel(); throw new Error('Page is larger than the 5 MB safety limit.') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength })
    return { inputUrl, responseUrl: response.url, html: new TextDecoder().decode(bytes) }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`, { cause: error })
    throw error
  } finally { clearTimeout(timeout) }
}
