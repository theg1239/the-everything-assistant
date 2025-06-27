import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (session?.user?.email !== process.env.RATE_LIMIT_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { slides } = body

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: 'Invalid broadcast payload' },
        { status: 400 }
      )
    }

    const newBroadcast = await prisma.broadcast.create({
      data: {
        slides: slides, 
      },
    })

    return NextResponse.json(newBroadcast, { status: 201 })
  } catch (error) {
    console.error('Error creating broadcast:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
