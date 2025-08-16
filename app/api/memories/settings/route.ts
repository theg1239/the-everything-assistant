import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { memoryService, memorySettingsSchema } from '@/lib/memory/memory-service'
import { z } from 'zod'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const data = memorySettingsSchema.parse(body)

    const settings = await memoryService.updateMemorySettings(session.user.id, data)
    return NextResponse.json(settings)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.issues), { status: 400 })
    }
    console.error('Failed to update memory settings:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
