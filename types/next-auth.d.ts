import NextAuth, { DefaultSession } from 'next-auth'

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
    } & DefaultSession['user']
  }

  interface User {
    id: string
  }
}
