import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { getRecentTokenUsage, getTokenUsageSummary, getTokenUsageAllTimeSummary } from '@/lib/db'

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

    const { searchParams } = new URL(req.url)
    const limitParam = searchParams.get('limit')
    const daysParam = searchParams.get('days')
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10))) : 50
    const days = daysParam ? Math.max(0, parseInt(daysParam, 10)) : 1

    const [recent, summary, summaryAllTime] = await Promise.all([
      getRecentTokenUsage(limit),
      getTokenUsageSummary(days),
      getTokenUsageAllTimeSummary(),
    ])

    return NextResponse.json({
      recent,
      summary,
      summaryAllTime,
    })
  } catch (error: any) {
    console.error('Usage retrieval failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to get usage logs',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
