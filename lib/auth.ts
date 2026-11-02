import { cache } from 'react'
import { cookies } from 'next/headers'
import { LEGACY_VTOP_COOKIES } from '@/lib/vtop-credential-schema'
import type { NextAuthOptions, Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import SpotifyProvider from 'next-auth/providers/spotify'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { isRecord } from '@/lib/json'
import {
  clearSessionVerificationForToken,
  getCurrentSessionVerification,
  readSessionToken,
} from '@/lib/session'

type GoogleAuthProvider = ReturnType<typeof GoogleProvider>
type SpotifyAuthProvider = ReturnType<typeof SpotifyProvider>
type AuthProvider = GoogleAuthProvider | SpotifyAuthProvider

const inferredNextAuthUrl =
  process.env.NEXTAUTH_URL?.trim() ||
  process.env.AUTH_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
  ''

if (!process.env.NEXTAUTH_URL && inferredNextAuthUrl) {
  process.env.NEXTAUTH_URL = inferredNextAuthUrl
}

const providers: AuthProvider[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    // Never attach a Google login to an existing user just because the e-mail matches.
    allowDangerousEmailAccountLinking: false,
    authorization: {
      params: {
        prompt: 'consent',
        access_type: 'offline',
        response_type: 'code',
      },
    },
  }) satisfies GoogleAuthProvider,
]

const hasSpotifyCreds = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)

if (hasSpotifyCreds) {
  providers.push(
    // Link-only: see `allowSignIn` (Spotify e-mails are unverified, so it must never
    // create or sign in to an account on its own).
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: false,
      authorization:
        'https://accounts.spotify.com/authorize?scope=user-read-currently-playing%20user-read-playback-state%20user-modify-playback-state',
    }) satisfies SpotifyAuthProvider
  )
} else {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Spotify credentials not set; Spotify integration is disabled')
  }
}

const SPOTIFY_LINK_REQUIRES_SIGN_IN = '/login?error=SpotifyLinkRequiresSignIn'
const SPOTIFY_ALREADY_LINKED = '/?error=SpotifyAlreadyLinked'

/**
 * The user behind the request's session cookie (valid, unexpired session) and whether that
 * session has passed MFA when required. Used in the OAuth callback, where `getServerSession`
 * isn't available; next-auth links the incoming account to this user if it's new.
 */
async function cookieSessionUser(): Promise<{ id: string; fullyAuthenticated: boolean } | null> {
  const sessionToken = await readSessionToken()
  if (!sessionToken) return null
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { expires: true, user: { select: { id: true, mfaEnabled: true } } },
  })
  if (!session || session.expires.getTime() <= Date.now()) return null
  const { id, mfaEnabled } = session.user
  return {
    id,
    fullyAuthenticated: !mfaEnabled || (await getCurrentSessionVerification(id)) !== null,
  }
}

async function linkedUserId(provider: string, providerAccountId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  })
  return account?.userId ?? null
}

/**
 * Account-linking policy (both providers set `allowDangerousEmailAccountLinking: false`, so
 * next-auth never merges accounts by e-mail):
 * - Spotify is link-only: it needs an existing, MFA-verified session and can never create a
 *   user or start a session by itself (Spotify e-mails are unverified).
 * - Google must report a verified e-mail.
 * - No provider may link a new account to a session that hasn't passed MFA yet.
 */
async function allowSignIn(
  provider: string,
  providerAccountId: string,
  profile: unknown
): Promise<boolean | string> {
  const current = await cookieSessionUser()
  const ownerId = await linkedUserId(provider, providerAccountId)

  if (provider === 'spotify') {
    if (!current?.fullyAuthenticated) return SPOTIFY_LINK_REQUIRES_SIGN_IN
    if (ownerId && ownerId !== current.id) return SPOTIFY_ALREADY_LINKED
    return true
  }

  if (provider === 'google' && isRecord(profile) && profile.email_verified === false) {
    return false
  }

  // With a session cookie present, next-auth links an unseen account to that user.
  if (current && ownerId !== current.id && !current.fullyAuthenticated) return false
  return true
}

/** The adapter's session (`events.signOut`) carries the raw token for database sessions. */
function adapterSessionToken(session: unknown): string | null {
  return isRecord(session) && typeof session.sessionToken === 'string' ? session.sessionToken : null
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: 'database',
  },
  callbacks: {
    signIn: async ({ account, profile }) => {
      if (!account) return true
      return await allowSignIn(account.provider, account.providerAccountId, profile)
    },
    session: async ({ session, user }) => {
      if (session.user) {
        // The Prisma adapter loads the full user row with the session, so the MFA
        // flag is normally already here; only query if it is missing.
        const inlineMfaEnabled =
          'mfaEnabled' in user && typeof user.mfaEnabled === 'boolean' ? user.mfaEnabled : undefined
        const mfaEnabled =
          inlineMfaEnabled ??
          (
            await prisma.user.findUnique({
              where: { id: user.id },
              select: { mfaEnabled: true },
            })
          )?.mfaEnabled ??
          false

        session.user.id = user.id
        session.user.mfaRequired = mfaEnabled
        // One Redis GET, only for MFA users; any failure reads as unverified (fail closed).
        session.user.mfaVerified = mfaEnabled
          ? (await getCurrentSessionVerification(user.id)) !== null
          : false
      }
      return session
    },
  },
  events: {
    signOut: async ({ session }) => {
      const sessionToken = adapterSessionToken(session)
      if (sessionToken) await clearSessionVerificationForToken(sessionToken)
      // Legacy client-side VTOP credential cookies weren't bound to a user; never
      // leave them behind for the next person on a shared browser.
      try {
        const jar = await cookies()
        for (const name of LEGACY_VTOP_COOKIES) {
          if (jar.has(name)) jar.delete({ name, path: '/' })
        }
      } catch {
        // Outside a request scope (no cookie store); nothing to clear.
      }
    },
  },
  pages: {
    signIn: '/login',
  },
}

export interface SessionMfaState {
  /** The user has MFA enabled. */
  required: boolean
  /** This session has passed MFA (always `false` when not required). */
  verified: boolean
}

export type SessionAllowingPendingMfa = Session & { mfa: SessionMfaState }

/**
 * The session even if it still has to pass MFA, plus its MFA state. Only for the MFA
 * challenge flow (MFA endpoints, the root layout seeding `useSession()`); everything else
 * must use {@link auth}. Memoised per request in Server Components.
 */
export const authAllowingPendingMfa = cache(async (): Promise<SessionAllowingPendingMfa | null> => {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return {
    ...session,
    mfa: {
      required: session.user.mfaRequired === true,
      verified: session.user.mfaVerified === true,
    },
  }
})

/**
 * Current session, or `null` if signed out **or the user has MFA enabled and this session
 * hasn't passed it yet** (MFA is enforced here, server-side, for every caller). Memoised per
 * request in Server Components / layouts via React `cache`, so the layout, page and loaders
 * share one lookup. Prefer this over calling `getServerSession(authOptions)` directly.
 */
export const auth = cache(async (): Promise<Session | null> => {
  const session = await authAllowingPendingMfa()
  if (!session) return null
  if (session.mfa.required && !session.mfa.verified) return null
  return session
})
