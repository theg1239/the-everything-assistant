import { NextRequest, NextResponse } from 'next/server'
import { generatePkcePair } from '@/lib/pkce'
import { getOrCreateUserForPhone } from '@/lib/whatsapp-user'
import * as z from 'zod'
import { createOAuthState, OAUTH_STATE_TTL_SECONDS, OAuthStateUnavailableError } from '../oauth/state'

const apiKeyEnv = process.env.WHATSAPP_BOT_API_KEY

function validateAPIKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!apiKeyEnv) return false
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === apiKeyEnv
}

const linkRequestSchema = z
  .object({
    phoneNumber: z.string().optional().catch(undefined),
    userName: z.string().optional().catch(undefined),
  })
  .nullable()
  .catch(null)

export async function POST(request: NextRequest) {
  if (!validateAPIKey(request)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = linkRequestSchema.parse(await request.json().catch(() => null))
  const phoneNumber = body?.phoneNumber
  const userName = body?.userName

  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })
  }

  const user = await getOrCreateUserForPhone(phoneNumber, userName)

  const clientId = process.env.VTOP_MCP_CLIENT_ID || 'default-client'
  const proxyBase = process.env.VTOP_PROXY_URL?.replace(/\/$/, '') || 'http://localhost:3001'
  const redirectUri = `${process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/whatsapp/oauth/callback`

  const { verifier, challenge } = generatePkcePair()

  let state: string
  try {
    state = await createOAuthState({ userId: user.id, phone: phoneNumber, verifier })
  } catch (error) {
    if (error instanceof OAuthStateUnavailableError) {
      console.error('[whatsapp/link]', error.message)
      return NextResponse.json({ error: 'VTOP linking is not configured' }, { status: 503 })
    }
    throw error
  }

  const authorizeUrl = `${proxyBase}/oauth/authorize?response_type=code&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
    'mcp:tools'
  )}&code_challenge=${challenge}&code_challenge_method=S256&state=${encodeURIComponent(state)}`

  return NextResponse.json({
    link: authorizeUrl,
    expiresIn: OAUTH_STATE_TTL_SECONDS,
    message:
      'Tap this link to link your VTOP account securely. It opens the OAuth consent page; after confirmation, you can return to WhatsApp and run VTOP commands.',
  })
}
