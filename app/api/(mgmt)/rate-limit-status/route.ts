import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getUserRateLimiter } from '@/lib/user-rate-limiter'
import { validateEnvironmentConfig, getEnvironmentSummary } from '@/lib/env-config'
import {
  rateLimitActionRequestSchema,
  type RateLimitStatusResponse,
} from '@/types/api/rate-limit'

async function requireAdmin(): Promise<NextResponse | null> {
  const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
  if (!adminEmail) {
    return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
  }
  const session = await auth()
  if (!session?.user?.email || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
  }
  return null
}

export async function GET(_req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const userConfig = getUserRateLimiter().getConfig()
  const summary = getEnvironmentSummary()
  // getEnvironmentSummary() widens its labels to `string`; re-derive the literal unions here.
  const openaiApiKey = summary.openaiApiKey === 'Set' ? 'Set' : 'Not set'
  const adminEmail = summary.admin.email === 'Configured' ? 'Configured' : 'Not configured'

  const body: RateLimitStatusResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      validation: validateEnvironmentConfig(),
      summary: {
        hasRedis: summary.hasRedis,
        openaiApiKey,
        admin: { email: adminEmail },
      },
    },
    userRateLimit: {
      enabled: userConfig.enabled,
      requestsPerMinute: userConfig.requestsPerMinute,
      requestsPerHour: userConfig.requestsPerHour,
      requestsPerDay: userConfig.requestsPerDay,
    },
    healthCheck: {
      redis: summary.hasRedis ? 'Connected' : 'Not configured',
      openaiApiKey,
    },
  }
  return NextResponse.json(body)
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const rawBody: unknown = await req.json().catch(() => null)
  const parsed = rateLimitActionRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request payload', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    await getUserRateLimiter().resetUserLimits(parsed.data.userId)
    return NextResponse.json({
      message: 'User rate limits reset successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Rate limiting action failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to execute action', message }, { status: 500 })
  }
}
