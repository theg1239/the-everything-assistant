import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    return NextResponse.json(latestBroadcast)
  } catch (error) {
    console.error('Error fetching latest broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
