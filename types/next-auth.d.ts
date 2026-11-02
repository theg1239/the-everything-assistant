import NextAuth, { DefaultSession } from 'next-auth'
import type { MfaMethod } from '@/types/api/mfa'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      /**
       * The user has MFA enabled, so this session must pass MFA before `auth()` accepts it.
       * Set by the session callback in `lib/auth.ts` (also visible to `useSession()`).
       */
      mfaRequired?: boolean
      /** This session has passed MFA (server-side record; `false` when MFA isn't required). */
      mfaVerified?: boolean
      /** The user's MFA factor when `mfaRequired` (null otherwise, or for unknown DB values). */
      mfaMethod?: MfaMethod | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
  }
}
