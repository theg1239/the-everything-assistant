import * as z from 'zod'
import { isJsonObject } from '@/lib/json'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/prisma/generated/client'

const mcpTokenBundleSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  scope: z.string().optional(),
  tokenType: z.string().optional(),
  clientId: z.string().optional(),
})

export type McpTokenBundle = z.infer<typeof mcpTokenBundleSchema>

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

const PROVIDER = 'vtop'

function parsePreferences(pref: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return isJsonObject(pref) ? pref : {}
}

function getMcpTokens(prefs: Prisma.JsonObject): Prisma.JsonObject {
  const tokens = prefs.mcpTokens
  return isJsonObject(tokens) ? tokens : {}
}

export async function getUserMcpToken(userId: string, provider: string = PROVIDER) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { preferences: true },
  })
  const prefs = parsePreferences(user?.preferences)
  const bundle = getMcpTokens(prefs)[provider]
  if (!bundle) return null
  const parsed = mcpTokenBundleSchema.safeParse(bundle)
  return parsed.success ? parsed.data : null
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
      ...getMcpTokens(prefs),
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

  const rawOauthBase =
    process.env.VTOP_PROXY_URL ||
    process.env.VTOP_MCP_URL ||
    'http://localhost:3001'
  const oauthBase = rawOauthBase
    .replace(/\/$/, '')
    .replace(/\/mcp$/, '')
  const tokenUrl = `${oauthBase}/oauth/token`
  const clientId = bundle.clientId || process.env.VTOP_MCP_CLIENT_ID || 'default-client'

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

  const parsedJson = tokenResponseSchema.safeParse(await res.json().catch(() => null))
  const json = parsedJson.success ? parsedJson.data : null
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
  const tokens = getMcpTokens(prefs)
  if (!tokens[provider]) return
  const { [provider]: _removed, ...rest } = tokens
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...prefs, mcpTokens: rest } },
  })
}
