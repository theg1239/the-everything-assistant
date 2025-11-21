import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { saveUserMcpToken } from '@/lib/mcp-tokens'

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

function bad(msg: string, code = 400) {
  return new Response(msg, { status: code, headers: { 'Content-Type': 'text/plain' } })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) return bad('Missing code or state', 400)

  let payload: any
  try {
    payload = jwt.verify(
      state,
      process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'state-secret'
    )
  } catch (e) {
    return bad('Invalid or expired state', 400)
  }

  const verifier = payload?.v
  const userId = payload?.uid
  if (!verifier || !userId) return bad('Malformed state', 400)

  const clientId = process.env.VTOP_MCP_CLIENT_ID || 'default-client'
  const proxyBase = process.env.VTOP_PROXY_URL?.replace(/\/$/, '') || 'http://localhost:3001'
  const redirectUri = `${process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/whatsapp/oauth/callback`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  })

  const tokenRes = await fetch(`${proxyBase}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return bad(`Token exchange failed: ${tokenRes.status} ${text}`, 400)
  }

  const tokenJson = (await tokenRes.json().catch(() => null)) as TokenResponse | null
  if (!tokenJson?.access_token) return bad('No access_token in response', 400)

  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : null

  await saveUserMcpToken(userId, {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
    scope: tokenJson.scope,
    tokenType: tokenJson.token_type,
    clientId,
  })

  return new Response(
    'Linked successfully. You can return to WhatsApp and continue using VTOP commands.',
    { status: 200, headers: { 'Content-Type': 'text/plain' } }
  )
}
