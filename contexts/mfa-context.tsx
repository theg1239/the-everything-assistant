'use client'

import React, { createContext, useContext, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { isRecord } from '@/lib/json'

interface MFAContextType {
  isMFAVerified: boolean
  setMFAVerified: (verified: boolean) => void
  requiresMFA: boolean
  isCheckingMFA: boolean
}

const MFAContext = createContext<MFAContextType | undefined>(undefined)

/*
 * Per-tab MFA verification lives in sessionStorage, which the server cannot see.
 * It is read through `useSyncExternalStore` so SSR/hydration use the server
 * snapshot (`null` = unknown) and the client re-renders with the real value
 * right after hydration. Only users with MFA enabled ever hit the unknown state;
 * everyone else is resolved from the (server-seeded) session on the first render.
 */
const storageListeners = new Set<() => void>()

const subscribeToStorage = (listener: () => void) => {
  storageListeners.add(listener)
  return () => {
    storageListeners.delete(listener)
  }
}

const notifyStorageListeners = () => {
  for (const listener of storageListeners) listener()
}

const storageKey = (userId: string) => `mfa_verified_${userId}`

const readStoredVerification = (userId: string): boolean => {
  try {
    const raw = sessionStorage.getItem(storageKey(userId))
    if (!raw) return false
    const data: unknown = JSON.parse(raw)
    return isRecord(data) && Boolean(data.verified)
  } catch {
    return false
  }
}

const getServerVerificationSnapshot = (): boolean | null => null

export function MFAProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()

  const userId = session?.user?.id
  const requiresMFA = session?.requiresMFA || false
  const onLoginPage = pathname === '/login'

  const storedVerification = useSyncExternalStore<boolean | null>(
    subscribeToStorage,
    () => (userId && requiresMFA ? readStoredVerification(userId) : false),
    getServerVerificationSnapshot
  )

  const needsVerificationLookup = Boolean(userId) && requiresMFA && !onLoginPage
  const isCheckingMFA =
    status === 'loading' || (needsVerificationLookup && storedVerification === null)
  const isMFAVerified =
    Boolean(userId) && (!requiresMFA || onLoginPage || storedVerification === true)

  const setMFAVerified = (verified: boolean) => {
    if (!userId) return
    if (verified) {
      sessionStorage.setItem(
        storageKey(userId),
        JSON.stringify({
          verified: true,
          sessionId: userId,
        })
      )
    } else {
      sessionStorage.removeItem(storageKey(userId))
    }
    notifyStorageListeners()
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
