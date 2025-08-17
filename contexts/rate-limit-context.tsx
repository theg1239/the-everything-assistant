'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface RateLimitError {
  isRateLimit: boolean
  resetTime?: string
  userLimit?: boolean
  message?: string
}

interface RateLimitContextType {
  rateLimitError: RateLimitError | null
  setRateLimitError: (error: RateLimitError | null) => void
  clearRateLimitError: () => void
  checkForRateLimitError: (error: any) => boolean
}

const RateLimitContext = createContext<RateLimitContextType | undefined>(undefined)

export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(null)

  const clearRateLimitError = useCallback(() => {
    setRateLimitError(null)
  }, [])
  const checkForRateLimitError = useCallback((error: any): boolean => {
    if (!error) return false

    // Helpful debug log (dev only)
    // console.debug('[RateLimit] checkForRateLimitError received:', error)

    const trySet = (info: Partial<RateLimitError>) => {
        // Normalize resetTime to an ISO string when possible
        let normalizedReset: string | undefined = undefined
        const raw = info.resetTime as any
        if (raw !== undefined && raw !== null) {
          try {
            if (typeof raw === 'number') {
              // If it's likely seconds (10-digit), convert to ms
              const ms = raw < 1e12 ? raw * 1000 : raw
              normalizedReset = new Date(ms).toISOString()
            } else if (typeof raw === 'string') {
              const digits = raw.replace(/[^0-9]/g, '')
              if (digits && digits.length >= 10 && digits.length <= 13) {
                const n = parseInt(digits, 10)
                const ms = n < 1e12 ? n * 1000 : n
                const asDate = new Date(ms)
                if (!isNaN(asDate.getTime())) normalizedReset = asDate.toISOString()
              } else {
                const d = new Date(raw)
                if (!isNaN(d.getTime())) normalizedReset = d.toISOString()
              }
            }
          } catch {
            normalizedReset = undefined
          }
        }

        const payload: RateLimitError = {
          isRateLimit: true,
          resetTime: normalizedReset,
          userLimit: info.userLimit ?? false,
          message: info.message,
        }
      // debug log to help trace UI behaviour in development
      try {
        // eslint-disable-next-line no-console
        console.debug('[RateLimit] setting rate limit error in context:', payload)
      } catch {}
      setRateLimitError(payload)
    }

    // 1) Check status codes on common shapes
    const status = error?.status || error?.statusCode || error?.response?.status
    if (status === 429) {
      // try to parse body if present
      const body = error?.responseBody || error?.body || error?.response?.body || null
      if (body && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body)
          const msg = parsed.message || parsed.error || parsed.detail || parsed.error_description
          const userLimit = parsed.type === 'user_rate_limit' || /user/i.test(String(msg || ''))
          trySet({ resetTime: parsed.resetTime || parsed.reset_at || parsed.reset || undefined, userLimit, message: msg })
          return true
        } catch {
          trySet({ message: 'rate limit exceeded. please try again later.' })
          return true
        }
      }

      // No body, generic 429
      trySet({ message: 'rate limit exceeded. please try again later.' })
      return true
    }

    // 2) Check responseBody string (some errors include JSON in message or responseBody)
    const responseBody = error?.responseBody
    if (responseBody && typeof responseBody === 'string') {
      const txt = responseBody.trim()
      if (txt) {
        // quick substring checks
        if (txt.toLowerCase().includes('rate limit') || txt.toLowerCase().includes('too many requests') || txt.includes('RATE_LIMIT')) {
          try {
            const parsed = JSON.parse(txt)
            const msg = parsed.message || parsed.error || parsed.detail
            const userLimit = parsed.type === 'user_rate_limit' || /user/i.test(String(msg || ''))
            trySet({ resetTime: parsed.resetTime || parsed.reset_at, userLimit, message: msg })
            return true
          } catch {
            trySet({ message: txt })
            return true
          }
        }
      }
    }

    // 3) Check common message string patterns
    const errorMessage = String(error?.message || error?.toString() || '')
    const lower = errorMessage.toLowerCase()
    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('quota exceeded') || lower.includes('rate_limited') || lower.includes('rate_limit')) {
      // If message contains some JSON after a code like '429:' try to parse it
      const idx = errorMessage.indexOf('429:')
      if (idx !== -1) {
        const jsonPart = errorMessage.slice(idx + 4).trim()
        try {
          const parsed = JSON.parse(jsonPart)
          const msg = parsed.message || parsed.error
          const userLimit = parsed.type === 'user_rate_limit' || /user/i.test(String(msg || ''))
          trySet({ resetTime: parsed.resetTime || parsed.reset_at, userLimit, message: msg })
          return true
        } catch {
          // fallthrough to generic
        }
      }

      const isUserLimit = lower.includes('user') || lower.includes('you have exceeded')
      trySet({ userLimit: isUserLimit, message: isUserLimit ? 'you have exceeded your rate limit. please wait before sending another message.' : 'rate limit exceeded. please try again later.' })
      return true
    }

    return false
  }, [])

  return (
    <RateLimitContext.Provider
      value={{
        rateLimitError,
        setRateLimitError,
        clearRateLimitError,
        checkForRateLimitError,
      }}
    >
      {children}
    </RateLimitContext.Provider>
  )
}

export function useRateLimit() {
  const context = useContext(RateLimitContext)
  if (context === undefined) {
    throw new Error('useRateLimit must be used within a RateLimitProvider')
  }
  return context
}
