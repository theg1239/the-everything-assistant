'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type * as z from 'zod'
import { readApiMessage, readJson } from '@/lib/http'
import { errorMessage } from '@/components/narrow'
import { CHATGPT_CONNECT_ANNOUNCEMENT_SEEN_KEY } from '@/components/chatgpt-connect-announcement-storage'
import {
  chatgptLoginStartSchema,
  chatgptStatusSchema,
  type ChatgptLoginStartResult,
  type ChatgptStatus,
} from '@/types/api/chatgpt'

const AUTO_DISMISS_DURATION = 9000
const STORAGE_KEY = CHATGPT_CONNECT_ANNOUNCEMENT_SEEN_KEY

interface ChatgptConnectAnnouncementModalProps {
  enabled: boolean
}

interface ChatgptDeviceFlowState {
  loginId: string | null
  deviceCode: string
  verificationUrl: string | null
}

/** POSTs to a ChatGPT auth endpoint; throws with the server's error message on failure. */
async function postChatgptAuth<S extends z.ZodType>(
  url: string,
  init: RequestInit,
  schema: S,
  fallbackError: string
): Promise<z.infer<S>> {
  const response = await fetch(url, { method: 'POST', ...init })
  if (!response.ok) {
    const { error } = await readApiMessage(response)
    throw new Error(error || fallbackError)
  }
  return readJson(response, schema)
}

/** Current ChatGPT connection status; null on network/HTTP/shape failure. */
async function readChatgptStatus(): Promise<ChatgptStatus | null> {
  try {
    const response = await fetch('/api/auth/chatgpt/status', { cache: 'no-store' })
    if (!response.ok) return null
    return await readJson(response, chatgptStatusSchema)
  } catch {
    return null
  }
}

/** Opens `url` in a new tab, falling back to copying it when the popup is blocked. */
async function openOrCopyLoginUrl(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (opened) return
  try {
    await navigator.clipboard.writeText(url)
    toast.info('Popup blocked. ChatGPT login URL copied to clipboard.')
  } catch {
    toast.error('Popup blocked. Please allow popups and try again.')
  }
}

export function ChatgptConnectAnnouncementModal({ enabled }: ChatgptConnectAnnouncementModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Auto-dismiss countdown: time left (ms) while not running; consumed by a single timeout.
  const remainingMsRef = useRef(AUTO_DISMISS_DURATION)
  const [isPaused, setIsPaused] = useState(false)
  const [startingChatgptLogin, setStartingChatgptLogin] = useState(false)
  const [cancelingChatgptLogin, setCancelingChatgptLogin] = useState(false)
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null)
  const [chatgptDeviceFlow, setChatgptDeviceFlow] = useState<ChatgptDeviceFlowState | null>(null)
  const [chatgptLoginError, setChatgptLoginError] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    }
    setPendingLoginId(null)
    setChatgptDeviceFlow(null)
    setChatgptLoginError(null)
    setIsOpen(false)
  }, [])

  const handleCopyDeviceCode = useCallback(async () => {
    if (!chatgptDeviceFlow?.deviceCode) return
    try {
      await navigator.clipboard.writeText(chatgptDeviceFlow.deviceCode)
      toast.success('device code copied')
    } catch {
      toast.error('unable to copy device code')
    }
  }, [chatgptDeviceFlow])

  const handleOpenVerificationUrl = useCallback(async () => {
    const verificationUrl = chatgptDeviceFlow?.verificationUrl
    if (!verificationUrl) return
    await openOrCopyLoginUrl(verificationUrl)
  }, [chatgptDeviceFlow])

  const fetchChatgptStatus = useCallback(async (): Promise<ChatgptStatus | null> => {
    const data = await readChatgptStatus()
    if (!data) return null

    if (data.connected) {
      handleClose()
      return data
    }

    setPendingLoginId(data.pendingLoginId ?? null)
    setChatgptLoginError(data.lastLoginError ?? null)
    if (!data.pendingLoginId) {
      setChatgptDeviceFlow(null)
    }

    return data
  }, [handleClose])

  const handleStartChatgptLogin = useCallback(async () => {
    setStartingChatgptLogin(true)
    setChatgptLoginError(null)
    let data: ChatgptLoginStartResult
    try {
      data = await postChatgptAuth(
        '/api/auth/chatgpt/start',
        {},
        chatgptLoginStartSchema,
        'Unable to start ChatGPT login'
      )
    } catch (error) {
      console.error('Error starting ChatGPT login:', error)
      toast.error(errorMessage(error) || 'Unable to start ChatGPT login')
      setStartingChatgptLogin(false)
      return
    }

    const verificationUrl = data.verificationUrl ?? data.authUrl
    const loginId = data.loginId ?? null
    setPendingLoginId(loginId)

    if (data.deviceCode) {
      setChatgptDeviceFlow({
        loginId,
        deviceCode: data.deviceCode,
        verificationUrl,
      })
      toast.success('device code ready. copy it first, then continue to sign in.')
    } else {
      if (verificationUrl) {
        await openOrCopyLoginUrl(verificationUrl)
      }
      toast.success('Complete ChatGPT sign-in in the opened browser tab.')
      handleClose()
    }
    setStartingChatgptLogin(false)
  }, [handleClose])

  const handleCancelChatgptLogin = useCallback(async () => {
    if (!pendingLoginId) return
    setCancelingChatgptLogin(true)
    try {
      await postChatgptAuth(
        '/api/auth/chatgpt/cancel',
        {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loginId: pendingLoginId,
          }),
        },
        chatgptStatusSchema,
        'Unable to cancel ChatGPT login'
      )
      setPendingLoginId(null)
      setChatgptDeviceFlow(null)
      setChatgptLoginError(null)
      toast.success('ChatGPT login canceled')
    } catch (error) {
      console.error('Error canceling ChatGPT login:', error)
      toast.error(errorMessage(error) || 'Unable to cancel ChatGPT login')
    }
    setCancelingChatgptLogin(false)
  }, [pendingLoginId])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') return

    let cancelled = false

    const checkStatus = async () => {
      const data = await fetchChatgptStatus()
      if (!data || cancelled) return
      if (data.connected) return

      if (data.available) {
        remainingMsRef.current = AUTO_DISMISS_DURATION
        setIsOpen(true)
      }
    }

    void checkStatus()

    return () => {
      cancelled = true
    }
  }, [enabled, fetchChatgptStatus])

  useEffect(() => {
    if (!(isOpen && pendingLoginId)) return

    const interval = window.setInterval(() => {
      void fetchChatgptStatus()
    }, 2500)

    return () => window.clearInterval(interval)
  }, [isOpen, pendingLoginId, fetchChatgptStatus])

  useEffect(() => {
    if (!isOpen || isPaused || startingChatgptLogin || chatgptDeviceFlow) return

    // One timeout per running stretch; pausing (hover/touch, login in progress, device flow)
    // banks the time left so the countdown resumes where it stopped.
    const startTime = Date.now()
    const timeoutId = window.setTimeout(handleClose, remainingMsRef.current)

    return () => {
      window.clearTimeout(timeoutId)
      remainingMsRef.current = Math.max(0, remainingMsRef.current - (Date.now() - startTime))
    }
  }, [isOpen, isPaused, handleClose, startingChatgptLogin, chatgptDeviceFlow])

  if (!enabled || !isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={open => (!open ? handleClose() : null)}>
      <DialogContent
        className="max-w-md w-[95vw] bg-white dark:bg-slate-900 flex flex-col p-0 rounded-2xl shadow-2xl overflow-hidden h-auto max-h-[90vh] sm:max-h-[80vh] border-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <DialogTitle className="sr-only">ChatGPT login available</DialogTitle>

        <button
          onClick={handleClose}
          className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="close"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        <div className="relative h-24 sm:h-32 overflow-hidden">
          <Image
            src="/onboarding-artwork/artwork6.webp"
            alt="ChatGPT login artwork"
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
        </div>

        <div className="flex-1 relative">
          <div className="h-full flex flex-col px-5 py-2 sm:px-8 sm:py-4">
            <div className="flex-1 min-h-0 overflow-y-auto text-center">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">
                you can now connect with ChatGPT
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                use better models and get faster responses by connecting your ChatGPT account.
              </p>
              {!chatgptDeviceFlow && (
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                  we will show your one-time device code first, then you can continue to sign in.
                </p>
              )}

              {chatgptDeviceFlow ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        step 1
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        copy this code
                      </p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 font-mono text-base tracking-[0.35em] text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          {chatgptDeviceFlow.deviceCode.toUpperCase()}
                        </code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCopyDeviceCode}
                          className="h-8"
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          copy code
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        step 2
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        open the ChatGPT sign-in page
                      </p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOpenVerificationUrl}
                          className="h-8"
                        >
                          continue to ChatGPT
                        </Button>
                      </div>
                    </div>

                    {chatgptLoginError && (
                      <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-300">
                        {chatgptLoginError}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void fetchChatgptStatus()
                        }}
                      >
                        i entered the code
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelChatgptLogin}
                        disabled={cancelingChatgptLogin}
                      >
                        {cancelingChatgptLogin ? 'canceling...' : 'cancel login'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-3">
                  <Button
                    onClick={handleStartChatgptLogin}
                    disabled={startingChatgptLogin}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl"
                  >
                    {startingChatgptLogin ? 'connecting...' : 'login with ChatGPT'}
                  </Button>
                </div>
              )}
              <Button
                onClick={handleClose}
                variant="ghost"
                className="w-full rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                maybe later
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
