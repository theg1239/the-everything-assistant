'use client'

import React, { createContext, useContext, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { isMfaStepUpRequired } from '@/types/api/mfa'

interface MFAContextType {
  /** The signed-in user has MFA enabled. */
  requiresMFA: boolean
  /** This session passed MFA server-side (or MFA isn't required). */
  isMFAVerified: boolean
  /**
   * Call after the MFA challenge succeeded (the server has recorded it): refreshes the
   * session and re-renders server components.
   */
  completeVerification: () => Promise<void>
  /**
   * Shows the MFA challenge as a dialog for a step-up (sensitive change). Resolves `true` once
   * verified, `false` if the user cancels. Resolves `true` immediately without MFA.
   */
  requestStepUp: () => Promise<boolean>
  /**
   * `fetch` that handles `403 { error: 'MFA_STEP_UP_REQUIRED' }`: prompts for MFA and retries
   * once. If the user cancels, the original 403 response is returned.
   */
  fetchWithStepUp: (input: string | URL, init?: RequestInit) => Promise<Response>
}

const MFAContext = createContext<MFAContextType | undefined>(undefined)

// Only loaded when a step-up is actually requested.
const MfaStepUpDialog = dynamic(
  () => import('@/components/mfa-challenge').then(mod => mod.MfaStepUpDialog),
  { ssr: false }
)

/**
 * MFA state comes from the server: the session callback exposes `mfaRequired`/`mfaVerified`
 * (backed by a per-session server-side record), and `auth()` rejects unverified sessions, so
 * nothing here is trusted for access control; it only decides what to render.
 */
export function MFAProvider({ children }: { children: React.ReactNode }) {
  const { data: session, update } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const pendingStepUps = useRef<Array<(verified: boolean) => void>>([])

  const requiresMFA = session?.user?.mfaRequired === true
  const isMFAVerified =
    Boolean(session?.user) && (!requiresMFA || session?.user?.mfaVerified === true)

  const completeVerification = async () => {
    await update()
    if (pathname === '/login') {
      router.replace('/')
    } else {
      router.refresh()
    }
  }

  const settleStepUp = (verified: boolean) => {
    setStepUpOpen(false)
    const waiting = pendingStepUps.current
    pendingStepUps.current = []
    for (const resolve of waiting) resolve(verified)
  }

  const requestStepUp = () => {
    if (!requiresMFA) return Promise.resolve(true)
    return new Promise<boolean>(resolve => {
      pendingStepUps.current.push(resolve)
      setStepUpOpen(true)
    })
  }

  // Takes a URL (not a `Request`) so the retry can resend the same `init`.
  const fetchWithStepUp = async (input: string | URL, init?: RequestInit) => {
    const response = await fetch(input, init)
    if (response.status !== 403) return response
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null)
    if (!isMfaStepUpRequired(body)) return response
    if (!(await requestStepUp())) return response
    return fetch(input, init)
  }

  return (
    <MFAContext.Provider
      value={{
        requiresMFA,
        isMFAVerified,
        completeVerification,
        requestStepUp,
        fetchWithStepUp,
      }}
    >
      {children}
      {stepUpOpen && (
        <MfaStepUpDialog
          onVerified={() => settleStepUp(true)}
          onCancel={() => settleStepUp(false)}
        />
      )}
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
