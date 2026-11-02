import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { memoryService, memorySettingsSchema } from '@/lib/memory/memory-service'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const settings = await memoryService.getUserMemorySettings(session.user.id)
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Failed to fetch memory settings:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const parsed = memorySettingsSchema.safeParse(body)
    if (!parsed.success) {
      return new NextResponse(JSON.stringify(parsed.error.issues), { status: 400 })
    }
    const data = parsed.data

    const settings = await memoryService.updateMemorySettings(session.user.id, data)
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Failed to update memory settings:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
