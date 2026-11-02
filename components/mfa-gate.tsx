'use client'

import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { MFAProvider, useMFA } from '@/contexts/mfa-context'

/** Static splash shown while the session or the challenge bundle is loading. */
function MFASplash() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060b]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.12),transparent_55%)]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/60 via-transparent to-black/70" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="text-center text-white">
          <h1 className="text-4xl font-light drop-shadow-lg">the everything assistant</h1>
        </div>
      </div>
    </div>
  )
}

// Only MFA users ever see the challenge, so keep it (and its WebGL backdrop) out
// of the shared bundle.
const MFAChallenge = dynamic(
  () => import('@/components/mfa-challenge').then(mod => mod.MFAChallenge),
  { ssr: false, loading: () => <MFASplash /> }
)

function MFAGateInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const { requiresMFA, isMFAVerified } = useMFA()

  // With the server session seeded into SessionProvider this is resolved during SSR.
  if (status === 'loading') {
    return <MFASplash />
  }

  if (!session?.user) {
    return <>{children}</>
  }

  // Server truth (`session.user.mfaVerified`). Shown on every route, /login included: a
  // pending session is signed in as far as next-auth is concerned, but `auth()` rejects it,
  // so pages redirect such users to /login, where they complete the challenge.
  if (requiresMFA && !isMFAVerified) {
    return (
      <div className="fixed inset-0 z-50">
        <MFAChallenge />
      </div>
    )
  }

  return <>{children}</>
}

export function MFAGate({ children }: { children: React.ReactNode }) {
  return (
    <MFAProvider>
      <MFAGateInner>{children}</MFAGateInner>
    </MFAProvider>
  )
}
