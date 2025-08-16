import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMessages } from '@/lib/db'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type ChatParams = Promise<{ chatId: string }>

export async function GET(req: NextRequest, { params }: { params: ChatParams }) {
  try {
    const { chatId } = await params

    const session = await getServerSession(authOptions)

    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
    }

    if (!session?.user?.email || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
    }

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 })
    }

    const all = await getMessages(chatId)

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, user: { select: { id: true, name: true, email: true } } },
    })

    const messages = all
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      }))

    return NextResponse.json({
      chatId,
      user: chat?.user ? { id: chat.user.id, name: chat.user.name, email: chat.user.email } : null,
      messages,
    })
  } catch (error: any) {
    console.error('Mgmt messages fetch failed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages', message: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
