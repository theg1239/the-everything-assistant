import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { broadcastSlidesSchema } from '@/types/api/broadcast'

export const revalidate = 0

export async function GET() {
  try {
    const latestBroadcast = await prisma.broadcast.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!latestBroadcast) {
      return NextResponse.json(null, { status: 200 })
    }

    const slides = broadcastSlidesSchema.parse(latestBroadcast.slides)

    return NextResponse.json({
      id: latestBroadcast.id,
      slides,
      createdAt: latestBroadcast.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching latest broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
