'use client'

import type React from 'react'
import type { Session } from 'next-auth'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

/**
 * `session` is the server session from the root layout. Seeding it means
 * `useSession()` is resolved during SSR and hydration (no `loading` phase and no
 * initial `/api/auth/session` round-trip). Focus refetch is off because sessions
 * are database-backed, so every refetch is a DB lookup; the session is still
 * re-read on navigation-triggering auth events and by API routes on every call.
 */
export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  return (
    <NextAuthSessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </NextAuthSessionProvider>
  )
}
