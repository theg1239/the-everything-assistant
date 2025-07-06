import { NextResponse } from 'next/server'
import { getTotalUsers, getMessagesInLast30Minutes, getToolCallStats } from '@/lib/stats'

export async function GET() {
  try {
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
  } catch (error) {
    console.error('Error fetching stats:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
