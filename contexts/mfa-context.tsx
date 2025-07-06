'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'

interface MFAContextType {
  isMFAVerified: boolean
  setMFAVerified: (verified: boolean) => void
  requiresMFA: boolean
  isCheckingMFA: boolean
}

const MFAContext = createContext<MFAContextType | undefined>(undefined)

export function MFAProvider({ children }: { children: React.ReactNode }) {
  const [isMFAVerified, setIsMFAVerified] = useState(false)
  const [isCheckingMFA, setIsCheckingMFA] = useState(true)
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  const requiresMFA = session?.requiresMFA || false

  useEffect(() => {
    if (status === 'loading') return

    if (!session?.user) {
      setIsCheckingMFA(false)
      setIsMFAVerified(false)
      return
    }

    if (pathname === '/login' || !requiresMFA) {
      setIsCheckingMFA(false)
      setIsMFAVerified(true)
      return
    }
    const storedMFAVerification = sessionStorage.getItem(`mfa_verified_${session.user.id}`)
    if (storedMFAVerification) {
      const verificationData = JSON.parse(storedMFAVerification)
      if (verificationData.verified) {
        setIsMFAVerified(true)
        setIsCheckingMFA(false)
        return
      }
    }

    if (requiresMFA && !isMFAVerified) {
      setIsCheckingMFA(false)
    } else {
      setIsCheckingMFA(false)
    }
  }, [session, status, pathname, requiresMFA, isMFAVerified])

  const setMFAVerified = (verified: boolean) => {
    setIsMFAVerified(verified)

    if (verified && session?.user?.id) {
      sessionStorage.setItem(
        `mfa_verified_${session.user.id}`,
        JSON.stringify({
          verified: true,
          sessionId: session.user.id,
        })
      )
    } else if (session?.user?.id) {
      sessionStorage.removeItem(`mfa_verified_${session.user.id}`)
    }
  }

  return (
    <MFAContext.Provider
      value={{
        isMFAVerified,
        setMFAVerified,
        requiresMFA,
        isCheckingMFA,
      }}
    >
      {children}
    </MFAContext.Provider>
  )
}

export function useMFA() {
  const context = useContext(MFAContext)
  if (context === undefined) {
    throw new Error('useMFA must be used within an MFAProvider')
  }
  return context
}
