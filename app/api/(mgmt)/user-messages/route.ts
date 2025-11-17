import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any

    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
    }

    if (!session?.user?.email || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
    }

    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const q = url.searchParams.get('q') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 })

    const chats = await prisma.chat.findMany({ where: { userId }, select: { id: true } })
    const chatIds = chats.map(c => c.id)

    const where: any = { chatId: { in: chatIds } }
    if (q) where.content = { contains: q, mode: 'insensitive' }

    const messages = await prisma.message.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: { id: true, chatId: true, role: true, content: true, created_at: true },
    })

    const mapped = messages.map(m => ({
      id: m.id,
      chatId: m.chatId,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    }))

    return NextResponse.json({ messages: mapped })
  } catch (error: any) {
    console.error('Mgmt user-messages fetch failed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user messages', message: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
