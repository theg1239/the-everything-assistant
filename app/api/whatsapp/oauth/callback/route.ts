import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { saveUserMcpToken } from '@/lib/mcp-tokens'
import * as z from 'zod'
import { consumeOAuthState, OAuthStateUnavailableError } from '../state'

const tokenResponseSchema = z.object({
  access_token: z.string().optional().catch(undefined),
  refresh_token: z.string().optional().catch(undefined),
  expires_in: z.number().optional().catch(undefined),
  scope: z.string().optional().catch(undefined),
  token_type: z.string().optional().catch(undefined),
})

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  // Signature, expiry, single use and user binding are all checked here; the PKCE
  // verifier comes from the server-side record, never from the URL.
  let pending: Awaited<ReturnType<typeof consumeOAuthState>>
  try {
    pending = await consumeOAuthState(state)
  } catch (error) {
    if (error instanceof OAuthStateUnavailableError) {
      console.error('[whatsapp/oauth]', error.message)
      return NextResponse.json({ error: 'VTOP linking is not configured' }, { status: 503 })
    }
    throw error
  }
  if (!pending) {
    return NextResponse.json({ error: 'Invalid or expired link. Request a new one.' }, { status: 400 })
  }
  const { userId, verifier: codeVerifier } = pending

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

  body.append('code_verifier', codeVerifier)

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '')
    console.error('Token exchange failed:', tokenRes.status, errText)
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 502 })
  }

  const parsedToken = tokenResponseSchema.safeParse(await tokenRes.json().catch(() => null))
  const json = parsedToken.success ? parsedToken.data : null
  const accessToken = json?.access_token
  if (!json || !accessToken) {
    return NextResponse.json({ error: 'Missing access_token in response' }, { status: 502 })
  }

  const expiresAt =
    json.expires_in && json.expires_in > 0
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null

  await saveUserMcpToken(userId, {
    accessToken,
    refreshToken: json.refresh_token,
    expiresAt,
    scope: json.scope,
    tokenType: json.token_type,
    clientId,
  })

  console.log('MCP token saved', {
    userId,
    tokenUrl,
    hasRefresh: Boolean(json.refresh_token),
    expiresAt,
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
