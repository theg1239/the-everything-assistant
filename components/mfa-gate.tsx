'use client'

import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { MFAProvider, useMFA } from '@/contexts/mfa-context'
import { MFAChallenge } from '@/components/mfa-challenge'
import { LoginFloatingBackground } from '@/components/login-floating-background'

function MFAGateInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { requiresMFA, isMFAVerified, isCheckingMFA } = useMFA()

  const showMFAChallenge = requiresMFA && !isMFAVerified && session?.user && pathname !== '/login'

  if (status === 'loading' || isCheckingMFA) {
    return (
      <LoginFloatingBackground>
        <div className="text-center text-white">
          <h1 className="text-4xl font-light drop-shadow-lg">the everything assistant</h1>
        </div>
      </LoginFloatingBackground>
    )
  }

  if (!session?.user) {
    return <>{children}</>
  }

  if (pathname === '/login') {
    return <>{children}</>
  }

  if (showMFAChallenge) {
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
