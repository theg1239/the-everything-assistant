'use client'

import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { MFAProvider, useMFA } from '@/contexts/mfa-context'
import { MFAChallenge } from '@/components/mfa-challenge'

function MFAGateInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { requiresMFA, isMFAVerified, isCheckingMFA } = useMFA()

  const showMFAChallenge = requiresMFA && !isMFAVerified && session?.user && pathname !== '/login'

  if (status === 'loading' || isCheckingMFA) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 z-10">
        <div className="text-center">
          <h1 className="text-4xl font-light text-white drop-shadow-lg">
            the everything assistant
          </h1>
        </div>
      </div>
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
