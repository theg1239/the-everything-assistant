import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { saveUserMcpToken } from '@/lib/mcp-tokens'
import * as z from 'zod'

const tokenResponseSchema = z.object({
  access_token: z.string().optional().catch(undefined),
  refresh_token: z.string().optional().catch(undefined),
  expires_in: z.number().optional().catch(undefined),
  scope: z.string().optional().catch(undefined),
  token_type: z.string().optional().catch(undefined),
})

const statePayloadSchema = z.looseObject({
  uid: z.unknown(),
  userId: z.unknown(),
  user_id: z.unknown(),
  sub: z.unknown(),
  v: z.unknown(),
  code_verifier: z.unknown(),
})

type StatePayload = z.infer<typeof statePayloadSchema>

function decodeState(state: string): StatePayload | null {
  try {
    const encodedPayload = state.split('.')[1]
    if (encodedPayload === undefined) return null
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const parsed = statePayloadSchema.safeParse(JSON.parse(payload))
    return parsed.success ? parsed.data : null
  } catch (err) {
    console.error('Failed to decode state JWT:', err)
    return null
  }
}

/** First truthy string among the candidates (mirrors a `a || b || c` chain over string claims). */
function firstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
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
    firstString(statePayload?.uid, statePayload?.userId, statePayload?.user_id, statePayload?.sub) ??
    null
  const codeVerifier = firstString(statePayload?.v, statePayload?.code_verifier)

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
