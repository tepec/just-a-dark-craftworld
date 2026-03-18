import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BL_')

  return {
    plugins: [vue(), tailwindcss()],
    server: {
      proxy: {
        '/api-epub': {
          target: 'http://localhost:5173',
          selfHandleResponse: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const productId = req.url.split('/api-epub/')[1]?.split('?')[0]
              if (!productId) {
                res.writeHead(400)
                res.end('Missing productId')
                return
              }
              const headers = {
                'User-Agent': 'okhttp/4.12.0',
                'Authorization': `Bearer ${env.BL_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              }
              // Step 1: get signed download URL
              fetch(`https://api.apps.blacklibrary.com/purchases/${productId}/download`, {
                method: 'POST',
                headers,
                body: '{}',
              })
                .then(async (dlRes) => {
                  if (!dlRes.ok) {
                    res.writeHead(dlRes.status)
                    res.end(`Download URL error: ${dlRes.status}`)
                    return
                  }
                  const { url } = await dlRes.json()
                  // Step 2: fetch the actual EPUB from CloudFront
                  const epubRes = await fetch(url, {
                    headers: {
                      'User-Agent': 'okhttp/4.12.0',
                      'Authorization': `Bearer ${env.BL_ACCESS_TOKEN}`,
                    },
                  })
                  if (!epubRes.ok) {
                    res.writeHead(epubRes.status)
                    res.end(`EPUB fetch error: ${epubRes.status}`)
                    return
                  }
                  res.writeHead(200, { 'Content-Type': 'application/epub+zip' })
                  const buffer = await epubRes.arrayBuffer()
                  res.end(Buffer.from(buffer))
                })
                .catch((e) => {
                  res.writeHead(502)
                  res.end(e.message)
                })
            })
          },
        },
        '/api': {
          target: 'https://api.apps.blacklibrary.com',
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
