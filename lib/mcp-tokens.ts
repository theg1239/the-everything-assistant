import { prisma } from '@/lib/prisma'

export type McpTokenBundle = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string | null
  scope?: string
  tokenType?: string
  clientId?: string
}

const PROVIDER = 'vtop'

function parsePreferences(pref: any) {
  if (!pref || typeof pref !== 'object') return {}
  return pref
}

export async function getUserMcpToken(userId: string, provider: string = PROVIDER) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { preferences: true },
  })
  const prefs = parsePreferences(user?.preferences)
  const bundle = prefs?.mcpTokens?.[provider]
  if (!bundle) return null
  return bundle as McpTokenBundle
}

export async function saveUserMcpToken(
  userId: string,
  bundle: McpTokenBundle,
  provider: string = PROVIDER
) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  })
  const prefs = parsePreferences(current?.preferences)
  const nextPrefs = {
    ...prefs,
    mcpTokens: {
      ...(prefs.mcpTokens || {}),
      [provider]: bundle,
    },
  }

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: nextPrefs },
  })
}

export function isExpired(bundle: McpTokenBundle | null) {
  if (!bundle?.expiresAt) return false
  const expires = new Date(bundle.expiresAt).getTime()
  return Date.now() > expires - 60_000 // refresh 1 minute early
}

export async function refreshUserMcpToken(userId: string, provider: string = PROVIDER) {
  const bundle = await getUserMcpToken(userId, provider)
  if (!bundle?.refreshToken) return null

  const oauthBase = process.env.VTOP_PROXY_URL?.replace(/\/$/, '') || 'http://localhost:3001'
  const tokenUrl = `${oauthBase}/oauth/token`
  const clientId = process.env.VTOP_MCP_CLIENT_ID || 'default-client'

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: bundle.refreshToken,
    client_id: clientId,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) return null

  type TokenResponse = {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }

  const json = (await res.json().catch(() => null)) as TokenResponse | null
  if (!json?.access_token) return null

  const next: McpTokenBundle = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || bundle.refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
    scope: json.scope,
    tokenType: json.token_type,
    clientId,
  }

  await saveUserMcpToken(userId, next, provider)
  return next
}

export async function clearUserMcpToken(userId: string, provider: string = PROVIDER) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  })
  const prefs = parsePreferences(current?.preferences)
  if (!prefs?.mcpTokens?.[provider]) return
  const { [provider]: _removed, ...rest } = prefs.mcpTokens
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...prefs, mcpTokens: rest } },
  })
}
