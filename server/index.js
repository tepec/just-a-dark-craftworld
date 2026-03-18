import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAccessToken, refreshAccessToken } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const BL_API = 'https://api.apps.blacklibrary.com'

// EPUB download: get signed URL + fetch from CloudFront in one call
app.get('/api-epub/:productId', async (req, res) => {
  const { productId } = req.params
  const token = getAccessToken()
  const headers = {
    'User-Agent': 'okhttp/4.12.0',
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  try {
    // Step 1: get signed download URL
    const dlRes = await fetch(`${BL_API}/purchases/${productId}/download`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    if (!dlRes.ok) return res.status(dlRes.status).end(`Download URL error: ${dlRes.status}`)
    const { url } = await dlRes.json()

    // Step 2: fetch the actual EPUB from CloudFront
    const epubRes = await fetch(url, {
      headers: { 'User-Agent': 'okhttp/4.12.0', 'Authorization': `Bearer ${token}` },
    })
    if (!epubRes.ok) return res.status(epubRes.status).end(`EPUB fetch error: ${epubRes.status}`)

    res.setHeader('Content-Type', 'application/epub+zip')
    const buffer = await epubRes.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Audio streaming: get signed URL + proxy with range support
const audioUrlCache = new Map()

async function getAudioSignedUrl(productId) {
  const cached = audioUrlCache.get(productId)
  if (cached && cached.expires > Date.now()) return cached.url
  const token = getAccessToken()
  const dlRes = await fetch(`${BL_API}/purchases/${productId}/download`, {
    method: 'POST',
    headers: {
      'User-Agent': 'okhttp/4.12.0',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!dlRes.ok) throw new Error(`Download URL error: ${dlRes.status}`)
  const { url } = await dlRes.json()
  audioUrlCache.set(productId, { url, expires: Date.now() + 50 * 60 * 1000 })
  return url
}

app.get('/api-audio/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const fetchHeaders = { 'User-Agent': 'okhttp/4.12.0' }
    if (req.headers.range) fetchHeaders['Range'] = req.headers.range

    let url = await getAudioSignedUrl(productId)
    let audioRes = await fetch(url, { headers: fetchHeaders })

    // If CloudFront returns 403, the signed URL likely expired — get a fresh one
    if (audioRes.status === 403) {
      audioUrlCache.delete(productId)
      url = await getAudioSignedUrl(productId)
      audioRes = await fetch(url, { headers: fetchHeaders })
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Accept-Ranges', 'bytes')
    if (audioRes.headers.get('content-length')) res.setHeader('Content-Length', audioRes.headers.get('content-length'))
    if (audioRes.headers.get('content-range')) res.setHeader('Content-Range', audioRes.headers.get('content-range'))
    res.status(audioRes.status)

    const reader = audioRes.body.getReader()
    async function pump() {
      while (true) {
        const { done, value } = await reader.read()
        if (done) { res.end(); break }
        if (!res.write(value)) await new Promise(r => res.once('drain', r))
      }
    }
    pump().catch(() => res.end())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Proxy /api/* to Black Library API (after explicit /api-epub and /api-audio routes)
app.use('/api', createProxyMiddleware({
  target: BL_API,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.setHeader('User-Agent', 'okhttp/4.12.0')
      proxyReq.setHeader('Authorization', `Bearer ${getAccessToken()}`)
    },
    proxyRes: async (proxyRes, req, res) => {
      if (proxyRes.statusCode === 401) {
        try {
          await refreshAccessToken()
          console.log('Token refreshed, client should retry')
        } catch (e) {
          console.error('Token refresh failed:', e.message)
        }
      }
    },
  },
}))

// Serve Vue app static files
app.use(express.static(resolve(__dirname, '../dist')))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(resolve(__dirname, '../dist/index.html'))
})

app.listen(PORT, () => {
  console.log(`Black Library Reader running at http://localhost:${PORT}`)
})
