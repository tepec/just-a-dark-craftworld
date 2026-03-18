import dotenv from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

dotenv.config()

const AUTH0_DOMAIN = 'https://login.mywarhammer.com'
const CLIENT_ID = '9ZzNoBg7wu9YSAQg3oohp24RICm35iD6'

let accessToken = process.env.BL_ACCESS_TOKEN
let refreshToken = process.env.BL_REFRESH_TOKEN

export function getAccessToken() {
  return accessToken
}

export async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error('No refresh token available. Re-run bl_auth.py to get new tokens.')
  }

  const res = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'okhttp/4.12.0',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  accessToken = data.access_token
  if (data.refresh_token) {
    refreshToken = data.refresh_token
  }

  // Persist new tokens to .env
  try {
    const envPath = resolve(process.cwd(), '.env')
    let envContent = readFileSync(envPath, 'utf-8')
    envContent = envContent.replace(/^BL_ACCESS_TOKEN=.*/m, `BL_ACCESS_TOKEN=${accessToken}`)
    if (data.refresh_token) {
      envContent = envContent.replace(/^BL_REFRESH_TOKEN=.*/m, `BL_REFRESH_TOKEN=${refreshToken}`)
    }
    writeFileSync(envPath, envContent)
  } catch {
    // Non-critical: tokens are still in memory
    console.warn('Could not persist refreshed tokens to .env')
  }

  console.log('Access token refreshed successfully')
  return accessToken
}
