import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitedAI } from '@/lib/rate-limited-ai'
import { validateEnvironmentConfig, getEnvironmentSummary } from '@/lib/env-config'

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

    // use Groq provider
    const rateLimited = getRateLimitedAI('groq')

    const usageStats = await rateLimited.getUsageStats()
    const config = rateLimited.getConfig()
    const userConfig = rateLimited.getUserConfig()
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
          enableRotation: config.enableRotation,
          rotateOnRateLimit: config.rotateOnRateLimit,
          keyCount: config.keys.length,
          rateLimit: config.rateLimit,
          retryConfig: config.retryConfig,
          keyHealthCheckInterval: config.keyHealthCheckInterval,
        },
        userRateLimit: {
          enabled: userConfig.enabled,
          requestsPerMinute: userConfig.requestsPerMinute,
          requestsPerHour: userConfig.requestsPerHour,
          requestsPerDay: userConfig.requestsPerDay,
        },
      },
      keyUsage: usageStats,
      healthCheck: {
        redis: envSummary.hasRedis ? 'Connected' : 'Not configured',
        apiKeys: envSummary.apiKeys.totalAvailable > 0 ? 'Available' : 'None configured',
      },
    })
  } catch (error: any) {
    console.error('Rate limiting status check failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to get rate limiting status',
        message: error.message || 'Unknown error',
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

    const body = await req.json()
    const { action } = body

    // use Groq provider
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
        const { config } = body
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
  } catch (error: any) {
    console.error('Rate limiting action failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to execute action',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
