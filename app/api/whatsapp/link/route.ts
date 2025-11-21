import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import { generatePkcePair } from '@/lib/pkce'
import { getOrCreateUserForPhone } from '@/lib/whatsapp-user'

const apiKeyEnv = process.env.WHATSAPP_BOT_API_KEY

function validateAPIKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!apiKeyEnv) return false
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === apiKeyEnv
}

export async function POST(request: NextRequest) {
  if (!validateAPIKey(request)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    phoneNumber?: string
    userName?: string
  } | null
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

  const statePayload = {
    uid: user.id,
    phone: phoneNumber,
    v: verifier,
    exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
  }

  const state = jwt.sign(
    statePayload,
    process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'state-secret'
  )

  const authorizeUrl = `${proxyBase}/oauth/authorize?response_type=code&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
    'mcp:tools'
  )}&code_challenge=${challenge}&code_challenge_method=S256&state=${encodeURIComponent(state)}`

  return NextResponse.json({
    link: authorizeUrl,
    expiresIn: 600,
    message:
      'Tap this link to link your VTOP account securely. It opens the OAuth consent page; after confirmation, you can return to WhatsApp and run VTOP commands.',
  })
}
