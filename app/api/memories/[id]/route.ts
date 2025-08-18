import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/options'
import { memoryService, memorySchema } from '@/lib/memory/memory-service'
import { z } from 'zod'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const memory = await memoryService.getMemory(id, session.user.id)
    if (!memory) {
      return new NextResponse('Memory not found', { status: 404 })
    }

    return NextResponse.json(memory)
  } catch (error) {
    console.error('Failed to fetch memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const data = memorySchema.partial().parse(body)

    const existing = await memoryService.getMemory(id, session.user.id)
    if (!existing) {
      return new NextResponse('Memory not found', { status: 404 })
    }

    const memory = await memoryService.upsertMemory(session.user.id, {
      ...existing,
      ...data,
      id,
    })

    return NextResponse.json(memory)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.errors), { status: 400 })
    }
    console.error('Failed to update memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const existing = await memoryService.getMemory(id, session.user.id)
    if (!existing) {
      return new NextResponse('Memory not found', { status: 404 })
    }

    await memoryService.deleteMemory(session.user.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Failed to delete memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
