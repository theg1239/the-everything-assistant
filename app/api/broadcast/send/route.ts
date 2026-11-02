import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { revalidateBroadcasts } from '@/lib/broadcast'
import { broadcastPayloadSchema, type BroadcastPayload } from '@/types/api/broadcast'

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) return admin.response

  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsedPayload = broadcastPayloadSchema.safeParse(rawBody)
    if (!parsedPayload.success) {
      return NextResponse.json(
        { error: 'Invalid broadcast payload', details: parsedPayload.error.flatten() },
        { status: 400 }
      )
    }

    const payload: BroadcastPayload = parsedPayload.data

    const newBroadcast = await prisma.broadcast.create({
      data: {
        slides: payload.slides,
      },
    })
    revalidateBroadcasts()

    return NextResponse.json(
      {
        id: newBroadcast.id,
        slides: payload.slides,
        createdAt: newBroadcast.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
