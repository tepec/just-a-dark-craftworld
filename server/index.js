import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAccessToken, refreshAccessToken } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const BL_API = 'https://api.apps.blacklibrary.com'

// Proxy /api/* to Black Library API
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
      // Auto-refresh on 401
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

// Serve Vue app static files
app.use(express.static(resolve(__dirname, '../dist')))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(resolve(__dirname, '../dist/index.html'))
})

app.listen(PORT, () => {
  console.log(`Black Library Reader running at http://localhost:${PORT}`)
})
