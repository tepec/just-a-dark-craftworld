const API_BASE = '/api'

export async function fetchLibrary() {
  // The root endpoint returns the user's purchased productIds
  const res = await fetch(`${API_BASE}/`, {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchBookDetails(productIds) {
  // POST /titles/products with an array of productIds
  const res = await fetch(`${API_BASE}/titles/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ productIds }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchEpubBlob(productId) {
  // Check IndexedDB cache first
  const { getCachedEpub, cacheEpub } = await import('./epubCache.js')
  const cached = await getCachedEpub(productId)
  if (cached) return cached

  // Single call — the server handles getting the signed URL + fetching from CloudFront
  const res = await fetch(`/api-epub/${productId}`)
  if (!res.ok) throw new Error(`EPUB download error: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const blob = new Blob([buffer], { type: 'application/epub+zip' })

  // Cache in background (don't block)
  cacheEpub(productId, blob).catch(() => {})

  return blob
}
