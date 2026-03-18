import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const BL_API = 'https://api.apps.blacklibrary.com'

function blMiddleware(env) {
  // Cache signed URLs per productId
  const audioUrlCache = new Map()

  async function getAudioSignedUrl(productId) {
    const cached = audioUrlCache.get(productId)
    if (cached && cached.expires > Date.now()) return cached.url
    const dlRes = await fetch(`${BL_API}/purchases/${productId}/download`, {
      method: 'POST',
      headers: {
        'User-Agent': 'okhttp/4.12.0',
        'Authorization': `Bearer ${env.BL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!dlRes.ok) throw new Error(`Download URL error: ${dlRes.status}`)
    const { url } = await dlRes.json()
    audioUrlCache.set(productId, { url, expires: Date.now() + 50 * 60 * 1000 })
    return url
  }

  return {
    name: 'bl-api-middleware',
    configureServer(server) {
      // EPUB download
      server.middlewares.use('/api-epub', async (req, res) => {
        const productId = req.url.split('/')[1]?.split('?')[0]
        if (!productId) { res.writeHead(400); res.end('Missing productId'); return }

        try {
          const headers = {
            'User-Agent': 'okhttp/4.12.0',
            'Authorization': `Bearer ${env.BL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          }
          const dlRes = await fetch(`${BL_API}/purchases/${productId}/download`, {
            method: 'POST', headers, body: '{}',
          })
          if (!dlRes.ok) { res.writeHead(dlRes.status); res.end(`Download URL error: ${dlRes.status}`); return }
          const { url } = await dlRes.json()

          const epubRes = await fetch(url, {
            headers: { 'User-Agent': 'okhttp/4.12.0', 'Authorization': `Bearer ${env.BL_ACCESS_TOKEN}` },
          })
          if (!epubRes.ok) { res.writeHead(epubRes.status); res.end(`EPUB fetch error: ${epubRes.status}`); return }

          res.writeHead(200, { 'Content-Type': 'application/epub+zip' })
          const buffer = await epubRes.arrayBuffer()
          res.end(Buffer.from(buffer))
        } catch (e) {
          if (!res.headersSent) res.writeHead(502)
          res.end(e.message)
        }
      })

      // Audio streaming with range support
      server.middlewares.use('/api-audio', async (req, res) => {
        const productId = req.url.split('/')[1]?.split('?')[0]
        if (!productId) { res.writeHead(400); res.end('Missing productId'); return }

        try {
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

          const resHeaders = {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
          }
          if (audioRes.headers.get('content-length')) resHeaders['Content-Length'] = audioRes.headers.get('content-length')
          if (audioRes.headers.get('content-range')) resHeaders['Content-Range'] = audioRes.headers.get('content-range')

          res.writeHead(audioRes.status, resHeaders)
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
          console.error('Audio proxy error:', e)
          if (!res.headersSent) res.writeHead(502)
          res.end(e.message)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BL_')

  return {
    plugins: [vue(), tailwindcss(), blMiddleware(env)],
    server: {
      proxy: {
        '/api': {
          target: BL_API,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('User-Agent', 'okhttp/4.12.0')
              proxyReq.setHeader('Authorization', `Bearer ${env.BL_ACCESS_TOKEN}`)
            })
          },
        },
      },
    },
  }
})
