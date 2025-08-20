import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTotalUsers, getMessagesInLast30Minutes, getToolCallStats } from '@/lib/stats'

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

    const [totalUsers, messagesInLast30Minutes, toolCallStats] = await Promise.all([
      getTotalUsers(),
      getMessagesInLast30Minutes(),
      getToolCallStats(),
    ])

    return NextResponse.json({
      totalUsers,
      messagesInLast30Minutes,
      toolCallStats,
    })
  } catch (error: any) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats', message: error.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
