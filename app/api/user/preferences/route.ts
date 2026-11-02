import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  userPreferencesSchema,
  preferencesPatchSchema,
  type UserPreferences,
} from '@/types/preferences'

export const runtime = 'nodejs'

/** Reads the `User.preferences` JSON column; keeps unknown keys so PATCH writes them back untouched. */
function readStoredPreferences(value: unknown): UserPreferences {
  const parsed = userPreferencesSchema.passthrough().safeParse(value)
  return parsed.success ? parsed.data : {}
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { preferences: true },
    })

    const storedPreferences = readStoredPreferences(user?.preferences)
    const basePreferences: UserPreferences = {
      followUpSuggestions:
        typeof storedPreferences.followUpSuggestions === 'boolean'
          ? storedPreferences.followUpSuggestions
          : true,
      auroraBackground:
        typeof storedPreferences.auroraBackground === 'boolean'
          ? storedPreferences.auroraBackground
          : false,
      ...storedPreferences,
    }

    const preferences = userPreferencesSchema.parse({
      ...basePreferences,
      dailyBriefing:
        storedPreferences.dailyBriefing ?? {
          dismissTime: '07:30',
          emailEnabled: false,
          emailTime: '07:30',
        },
      backgroundConfig:
        storedPreferences.backgroundConfig ?? {
          type: 'aurora',
          enabled: basePreferences.auroraBackground ?? false,
        },
    })

    return NextResponse.json({ preferences })
  } catch (error) {
    console.error('Error fetching user preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const parsedBody = preferencesPatchSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 })
    }
    const body = parsedBody.data

    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { preferences: true },
    })
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentPrefs = readStoredPreferences(existingUser.preferences)
    let preferencesToUpdate: UserPreferences = { ...currentPrefs }

    if (body.preferences) {
      // Merge, never replace: the stored JSON also holds server-managed keys
      // (mcpTokens, whatsapp/discord links, ...). `body.preferences` went through
      // `userPreferencesSchema`, which strips unknown keys, so clients can only
      // write the user-editable ones.
      const incoming = body.preferences
      preferencesToUpdate = {
        ...preferencesToUpdate,
        ...incoming,
        ...(incoming.backgroundConfig
          ? {
              backgroundConfig: {
                ...(preferencesToUpdate.backgroundConfig || {}),
                ...incoming.backgroundConfig,
              },
            }
          : {}),
        ...(incoming.dailyBriefing
          ? {
              dailyBriefing: {
                ...(preferencesToUpdate.dailyBriefing || {}),
                ...incoming.dailyBriefing,
              },
            }
          : {}),
      }
    } else {
      if (body.backgroundConfig) {
        preferencesToUpdate = {
          ...preferencesToUpdate,
          backgroundConfig: {
            ...(preferencesToUpdate.backgroundConfig || {}),
            ...body.backgroundConfig,
          },
        }
      }
      if (typeof body.followUpSuggestions === 'boolean') {
        preferencesToUpdate = {
          ...preferencesToUpdate,
          followUpSuggestions: body.followUpSuggestions,
        }
      }
      if (body.dailyBriefing) {
        preferencesToUpdate = {
          ...preferencesToUpdate,
          dailyBriefing: {
            ...(preferencesToUpdate.dailyBriefing || {}),
            ...body.dailyBriefing,
          },
        }
      }
      if (
        !body.backgroundConfig &&
        !body.dailyBriefing &&
        !body.preferences &&
        typeof body.followUpSuggestions !== 'boolean'
      ) {
        return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 })
      }
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        preferences: preferencesToUpdate,
        updated_at: new Date(),
      },
    })

    return NextResponse.json({
      // Only the user-editable keys go back to the browser (never mcpTokens etc.).
      preferences: userPreferencesSchema.parse(preferencesToUpdate),
      message: 'Preferences updated successfully',
    })
  } catch (error) {
    console.error('Error updating user preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
