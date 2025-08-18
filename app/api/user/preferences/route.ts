import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
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

    // Handle both old and new formats
    let preferencesToUpdate: any = {}

    if (body.preferences) {
      // Old format: { preferences: { followUpSuggestions: true, auroraBackground: true } }
      preferencesToUpdate = body.preferences
    } else if (body.backgroundConfig) {
      // New format: { backgroundConfig: { type: 'aurora', enabled: true } }
      // Get existing preferences first
      const existingUser = await prisma.user.findUnique({
        where: { email: session.user.email },
      })

      const existingPrefs = (existingUser as any)?.preferences || {}
      preferencesToUpdate = {
        ...existingPrefs,
        backgroundConfig: body.backgroundConfig,
      }
    } else {
      return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 })
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
