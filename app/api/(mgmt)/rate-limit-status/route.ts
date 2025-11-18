import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitedAI } from '@/lib/rate-limited-ai'
import type { ApiKeyUsageSnapshot } from '@/lib/api-key-manager'
import { validateEnvironmentConfig, getEnvironmentSummary } from '@/lib/env-config'
import { rateLimitActionRequestSchema } from '@/types/api/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
    }

    if (!session?.user?.email || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
    }

    const googleAI = getRateLimitedAI('google')
    const groqAI = getRateLimitedAI('groq')

    const [googleUsageStats, groqUsageStats, googleConfig, groqConfig] = await Promise.all([
      googleAI.getUsageStats(),
      groqAI.getUsageStats(),
      googleAI.getConfig(),
      groqAI.getConfig(),
    ])

    const combinedUsageStats: Record<string, ApiKeyUsageSnapshot> = {
      ...Object.fromEntries(
        Object.entries(googleUsageStats).map(([key, value]) => [`google_${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(groqUsageStats).map(([key, value]) => [`groq_${key}`, value])
      ),
    }

    const totalKeyCount = googleConfig.keys.length + groqConfig.keys.length
    const mainConfig = groqConfig // Base config is same
    const userConfig = groqAI.getUserConfig() // User config is not provider-specific
    const envValidation = validateEnvironmentConfig()
    const envSummary = getEnvironmentSummary()

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: {
        validation: envValidation,
        summary: envSummary,
      },
      configuration: {
        apiKeys: {
          enableRotation: mainConfig.enableRotation,
          rotateOnRateLimit: mainConfig.rotateOnRateLimit,
          keyCount: totalKeyCount,
          rateLimit: mainConfig.rateLimit,
          retryConfig: mainConfig.retryConfig,
          keyHealthCheckInterval: mainConfig.keyHealthCheckInterval,
        },
        userRateLimit: {
          enabled: userConfig.enabled,
          requestsPerMinute: userConfig.requestsPerMinute,
          requestsPerHour: userConfig.requestsPerHour,
          requestsPerDay: userConfig.requestsPerDay,
        },
      },
      keyUsage: combinedUsageStats,
      healthCheck: {
        redis: envSummary.hasRedis ? 'Connected' : 'Not configured',
        apiKeys: envSummary.apiKeys.totalAvailable > 0 ? 'Available' : 'None configured',
      },
    })
  } catch (error) {
    console.error('Rate limiting status check failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to get rate limiting status',
        message,
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
    }

    if (!session?.user?.email || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
    }

    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = rateLimitActionRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { action, config } = parsed.data

    const rateLimited = getRateLimitedAI('groq')

    switch (action) {
      case 'rotate':
        await rateLimited.rotateKey()
        return NextResponse.json({
          message: 'API key rotated successfully',
          timestamp: new Date().toISOString(),
        })

      case 'reset':
        await rateLimited.resetRateLimits()
        return NextResponse.json({
          message: 'Rate limits reset successfully',
          timestamp: new Date().toISOString(),
        })

      case 'update_config':
        if (!config) {
          return NextResponse.json({ error: 'Configuration object required' }, { status: 400 })
        }

        rateLimited.updateConfig(config)
        return NextResponse.json({
          message: 'Configuration updated successfully',
          newConfig: rateLimited.getConfig(),
          timestamp: new Date().toISOString(),
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Rate limiting action failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to execute action',
        message,
      },
      { status: 500 }
    )
  }
}
