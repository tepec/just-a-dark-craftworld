import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync, watchFile, unwatchFile } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { exec } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CLIENT_ID = '9ZzNoBg7wu9YSAQg3oohp24RICm35iD6'
const DOMAIN    = 'https://login.mywarhammer.com'
const AUDIENCE  = 'https://blacklibrary.com/app'
const REDIRECT  = 'com.gamesworkshop.bl://login.mywarhammer.com/android/com.gamesworkshop.bl/callback'

const ENV_FILE  = join(__dirname, '.env')
const CODE_FILE = join(tmpdir(), 'bl_auth_code.txt')

// --- PKCE ---
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')

// --- Auth URL ---
const params = new URLSearchParams({
  response_type:         'code',
  client_id:             CLIENT_ID,
  redirect_uri:          REDIRECT,
  audience:              AUDIENCE,
  scope:                 'openid profile email offline_access',
  code_challenge:        challenge,
  code_challenge_method: 'S256',
})
const authUrl = `${DOMAIN}/authorize?${params}`

// --- Clean up previous callback file ---
if (existsSync(CODE_FILE)) unlinkSync(CODE_FILE)

// --- Open browser ---
const openCmd = process.platform === 'win32' ? 'start ""' :
                process.platform === 'darwin' ? 'open' : 'xdg-open'
exec(`${openCmd} "${authUrl}"`)
console.log('Opening browser, please log in...')

// --- Wait for callback file ---
console.log('Waiting for callback...')

const code = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    unwatchFile(CODE_FILE)
    reject(new Error('Timeout — callback not received after 60s'))
  }, 60_000)

  const check = () => {
    if (existsSync(CODE_FILE)) {
      clearTimeout(timeout)
      unwatchFile(CODE_FILE)
      const raw = readFileSync(CODE_FILE, 'utf-8').trim()
      const url = new URL(raw)
      const authCode = url.searchParams.get('code')
      if (!authCode) reject(new Error('No code found in callback URL'))
      else resolve(authCode)
    }
  }

  // Poll every second (watchFile is unreliable across platforms for new files)
  const interval = setInterval(() => {
    if (existsSync(CODE_FILE)) {
      clearInterval(interval)
      check()
    }
  }, 1000)

  // Also watch in case it helps
  watchFile(CODE_FILE, { interval: 500 }, check)
})

console.log(`Code received: ${code.slice(0, 20)}...`)

// --- Auth0-Client header (matches Android SDK) ---
const auth0Client = Buffer.from(JSON.stringify({
  name: 'auth0-android',
  version: '2.10.0',
  env: { android: '34' },
})).toString('base64url')

// --- Exchange code for tokens ---
const tokenRes = await fetch(`${DOMAIN}/oauth/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Auth0-Client': auth0Client,
    'User-Agent':   'okhttp/4.12.0',
  },
  body: JSON.stringify({
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    code,
    redirect_uri:  REDIRECT,
    code_verifier: verifier,
  }),
})

if (!tokenRes.ok) {
  console.error(`HTTP ${tokenRes.status}: ${await tokenRes.text()}`)
  process.exit(1)
}

const tokens = await tokenRes.json()
const accessToken  = tokens.access_token
const refreshToken = tokens.refresh_token

if (!accessToken) {
  console.error('Error: no access token in response')
  process.exit(1)
}

// --- Write to .env ---
function updateEnv(key, value) {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : ''
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(content)) {
    content = content.replace(pattern, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }
  writeFileSync(ENV_FILE, content)
}

updateEnv('BL_ACCESS_TOKEN', accessToken)
updateEnv('BL_REFRESH_TOKEN', refreshToken)

console.log(`\nTokens written to ${ENV_FILE}`)
console.log('You can now start the app with: npm run dev')
