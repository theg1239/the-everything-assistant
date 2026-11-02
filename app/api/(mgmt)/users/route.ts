import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/prisma/generated/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin access not configured' }, { status: 503 })
    }

    if (!session?.user?.email || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized access - admin only' }, { status: 403 })
    }

    const url = new URL(request.url)
    const q = url.searchParams.get('q') || undefined
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '25', 10))
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}

    const users = await prisma.user.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, email: true, created_at: true },
    })

    const mapped = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.created_at,
    }))

    return NextResponse.json({ users: mapped })
  } catch (error) {
    console.error('Mgmt users fetch failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch users',
        message: error instanceof Error && error.message ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
