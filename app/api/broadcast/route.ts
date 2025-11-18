import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  broadcastDeleteSchema,
  broadcastSlidesSchema,
  broadcastUpdateSchema,
  pastBroadcastSchema,
  type PastBroadcast,
} from '@/types/api/broadcast'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (session?.user?.email !== process.env.RATE_LIMIT_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    })

    const transformedBroadcasts: PastBroadcast[] = broadcasts.map(broadcast => {
      const slides = broadcastSlidesSchema.parse(broadcast.slides)
      return pastBroadcastSchema.parse({
        id: broadcast.id,
        slides,
        timestamp: broadcast.createdAt.toISOString(),
        sentBy: session?.user?.email || 'Admin',
      })
    })

    return NextResponse.json({ broadcasts: transformedBroadcasts })
  } catch (error) {
    console.error('Error fetching broadcasts:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (session?.user?.email !== process.env.RATE_LIMIT_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = broadcastDeleteSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Broadcast ID is required' }, { status: 400 })
    }
    const { id } = parsed.data

    await prisma.broadcast.delete({
      where: {
        id: id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (session?.user?.email !== process.env.RATE_LIMIT_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = broadcastUpdateSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid broadcast payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { id, slides } = parsed.data

    const updatedBroadcast = await prisma.broadcast.update({
      where: {
        id: id,
      },
      data: {
        slides: slides as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      id: updatedBroadcast.id,
      slides,
      createdAt: updatedBroadcast.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
