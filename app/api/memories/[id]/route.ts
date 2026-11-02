import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { memoryService, memorySchema } from '@/lib/memory/memory-service'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const session = await auth()
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
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const parsed = memorySchema.partial().safeParse(body)
    if (!parsed.success) {
      return new NextResponse(JSON.stringify(parsed.error.issues), { status: 400 })
    }
    const data = parsed.data

    // One ownership-scoped UPDATE (previously a read, then the write).
    const memory = await memoryService.updateOwnedMemory(session.user.id, id, data)
    if (!memory) {
      return new NextResponse('Memory not found', { status: 404 })
    }

    return NextResponse.json(memory)
  } catch (error) {
    console.error('Failed to update memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // One ownership-scoped DELETE (previously a read, then the delete).
    if (!(await memoryService.deleteOwnedMemory(session.user.id, id))) {
      return new NextResponse('Memory not found', { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Failed to delete memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
