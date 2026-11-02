import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { memoryService, memorySchema } from '@/lib/memory/memory-service'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

    const result = await memoryService.getUserMemories(session.user.id, {
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch memories:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const parsed = memorySchema.safeParse(body)
    if (!parsed.success) {
      return new NextResponse(JSON.stringify(parsed.error.issues), { status: 400 })
    }
    const data = parsed.data

    const memory = await memoryService.upsertMemory(session.user.id, data)
    return NextResponse.json(memory, { status: 201 })
  } catch (error) {
    console.error('Failed to create memory:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
