import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    const preferences = (user as any)?.preferences || {
      followUpSuggestions: true,
      auroraBackground: true,
    }

    if (!preferences.dailyBriefing) {
      preferences.dailyBriefing = {
        dismissTime: '07:30',
        emailEnabled: false,
        emailTime: '07:30',
      }
    }

    if (!preferences.backgroundConfig && preferences.auroraBackground !== undefined) {
      preferences.backgroundConfig = {
        type: 'aurora',
        enabled: preferences.auroraBackground,
      }
    }

    return NextResponse.json({ preferences })
  } catch (error) {
    console.error('Error fetching user preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentPrefs = ((existingUser as any).preferences || {}) as Record<string, any>
    let preferencesToUpdate: Record<string, any> = { ...currentPrefs }

    if (body.preferences) {
      preferencesToUpdate = body.preferences
    } else {
      if (body.backgroundConfig) {
        preferencesToUpdate.backgroundConfig = body.backgroundConfig
      }
      if (typeof body.followUpSuggestions === 'boolean') {
        preferencesToUpdate.followUpSuggestions = body.followUpSuggestions
      }
      if (body.dailyBriefing) {
        preferencesToUpdate.dailyBriefing = {
          ...(preferencesToUpdate.dailyBriefing || {}),
          ...body.dailyBriefing,
        }
      }
      if (
        !body.backgroundConfig &&
        !body.dailyBriefing &&
        body.preferences === undefined &&
        typeof body.followUpSuggestions !== 'boolean'
      ) {
        return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 })
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        preferences: preferencesToUpdate,
        updated_at: new Date(),
      } as any,
    })

    return NextResponse.json({
      preferences: (updatedUser as any).preferences,
      message: 'Preferences updated successfully',
    })
  } catch (error) {
    console.error('Error updating user preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
