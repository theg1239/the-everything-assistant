'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { readJson } from '@/lib/http'

const AUTO_DISMISS_DURATION = 9000
const STORAGE_KEY = 'ea.chatgpt-connect-announcement.seen'

interface ChatgptStatusResponse {
  available: boolean
  connected: boolean
  error?: string
}

interface ChatgptLoginStartResponse {
  authUrl: string | null
  deviceCode?: string | null
  loginMethod?: 'browser' | 'device'
  verificationUrl?: string | null
  error?: string
}

interface ChatgptConnectAnnouncementModalProps {
  enabled: boolean
}

export function ChatgptConnectAnnouncementModal({ enabled }: ChatgptConnectAnnouncementModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)
  const [startingChatgptLogin, setStartingChatgptLogin] = useState(false)

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    }
    setIsOpen(false)
  }, [])

  const handleStartChatgptLogin = useCallback(async () => {
    setStartingChatgptLogin(true)
    try {
      const response = await fetch('/api/auth/chatgpt/start', {
        method: 'POST',
      })
      const data = await readJson<ChatgptLoginStartResponse>(response)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to start ChatGPT login')
      }

      if (data.authUrl) {
        const opened = window.open(data.authUrl, '_blank', 'noopener,noreferrer')
        if (!opened) {
          try {
            await navigator.clipboard.writeText(data.authUrl)
            toast.info('Popup blocked. ChatGPT login URL copied to clipboard.')
          } catch {
            toast.error('Popup blocked. Please allow popups and try again.')
          }
        }
      }

      if (data.deviceCode) {
        let copiedCode = false
        try {
          await navigator.clipboard.writeText(data.deviceCode)
          copiedCode = true
        } catch {
          copiedCode = false
        }
        toast.success(
          copiedCode
            ? `Enter code ${data.deviceCode} to finish ChatGPT sign-in (copied).`
            : `Enter code ${data.deviceCode} to finish ChatGPT sign-in.`
        )
      } else {
        toast.success('Complete ChatGPT sign-in in the opened browser tab.')
      }
      handleClose()
    } catch (error: any) {
      console.error('Error starting ChatGPT login:', error)
      toast.error(error?.message || 'Unable to start ChatGPT login')
    } finally {
      setStartingChatgptLogin(false)
    }
  }, [handleClose])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') return

    let cancelled = false

    const checkStatus = async () => {
      try {
        const response = await fetch('/api/auth/chatgpt/status', { cache: 'no-store' })
        const data = await readJson<ChatgptStatusResponse>(response)
        if (!response.ok) return
        if (cancelled) return

        if (data.connected) {
          window.localStorage.setItem(STORAGE_KEY, 'true')
          return
        }

        if (data.available) {
          setProgress(100)
          setIsOpen(true)
        }
      } catch {
      }
    }

    void checkStatus()

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!isOpen || isPaused || startingChatgptLogin) return

    const startTime = Date.now()
    const startProgress = progress

    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, startProgress - (elapsed / AUTO_DISMISS_DURATION) * 100)
      setProgress(remaining)

      if (remaining <= 0) {
        handleClose()
      }
    }, 50)

    return () => window.clearInterval(intervalId)
  }, [isOpen, isPaused, handleClose, startingChatgptLogin, AUTO_DISMISS_DURATION])

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
            src="/onboarding-artwork/artwork6.png"
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

              <div className="mb-3">
                <Button
                  onClick={handleStartChatgptLogin}
                  disabled={startingChatgptLogin}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl"
                >
                  {startingChatgptLogin ? 'connecting...' : 'login with ChatGPT'}
                </Button>
              </div>
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
