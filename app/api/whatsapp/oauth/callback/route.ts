import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { saveUserMcpToken } from '@/lib/mcp-tokens'

type RawTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

function decodeState(state: string): any | null {
  try {
    const parts = state.split('.')
    if (parts.length < 2) return null
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch (err) {
    console.error('Failed to decode state JWT:', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const statePayload = decodeState(state)
  const userId =
    statePayload?.uid ||
    statePayload?.userId ||
    statePayload?.user_id ||
    statePayload?.sub ||
    null
  const codeVerifier = statePayload?.v || statePayload?.code_verifier

  if (!userId) {
    return NextResponse.json({ error: 'Invalid state: user not found' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const rawOauthBase =
    process.env.VTOP_PROXY_URL ||
    process.env.VTOP_MCP_URL ||
    ''
  const oauthBase = rawOauthBase
    .replace(/\/$/, '')
    .replace(/\/mcp$/, '')
  const tokenUrl = oauthBase ? `${oauthBase}/oauth/token` : ''

  if (!tokenUrl) {
    return NextResponse.json({ error: 'VTOP_MCP_URL or VTOP_PROXY_URL not configured' }, { status: 500 })
  }

  const clientId = process.env.VTOP_MCP_CLIENT_ID || 'default-client'
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: `${url.origin}/api/whatsapp/oauth/callback`,
  })

  if (codeVerifier) {
    body.append('code_verifier', codeVerifier)
  }

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '')
    console.error('Token exchange failed:', tokenRes.status, errText)
    return NextResponse.json(
      { error: 'Token exchange failed', detail: errText || tokenRes.statusText },
      { status: 502 }
    )
  }

  const json = (await tokenRes.json().catch(() => null)) as RawTokenResponse | null
  if (!json?.access_token) {
    return NextResponse.json({ error: 'Missing access_token in response' }, { status: 502 })
  }

  const expiresAt =
    json.expires_in && json.expires_in > 0
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null

  await saveUserMcpToken(userId, {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scope: json.scope,
    tokenType: json.token_type,
    clientId,
  })

  const successHtml = `
<!DOCTYPE html>
<html>
  <head><title>VTOP linked</title></head>
  <body style="font-family: system-ui; padding: 24px;">
    <h2>VTOP linked successfully ✅</h2>
    <p>Go back to WhatsApp and re-run your command (e.g., <code>!ask check my attendance</code>).</p>
  </body>
</html>`

  return new NextResponse(successHtml, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
