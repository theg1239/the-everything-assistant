import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { prisma } from '@/lib/prisma'

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

    const transformedBroadcasts = broadcasts.map(broadcast => ({
      id: broadcast.id,
      slides: broadcast.slides,
      timestamp: broadcast.createdAt.toISOString(),
      sentBy: session?.user?.email || 'Admin',
    }))

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
    const body = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Broadcast ID is required' }, { status: 400 })
    }

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
    const body = await req.json()
    const { id, slides } = body

    if (!id) {
      return NextResponse.json({ error: 'Broadcast ID is required' }, { status: 400 })
    }

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: 'Invalid broadcast payload' }, { status: 400 })
    }

    const updatedBroadcast = await prisma.broadcast.update({
      where: {
        id: id,
      },
      data: {
        slides: slides,
      },
    })

    return NextResponse.json(updatedBroadcast)
  } catch (error) {
    console.error('Error updating broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
