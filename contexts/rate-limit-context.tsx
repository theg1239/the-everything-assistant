'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { isRecord } from '@/lib/json'
import { classifyChatError } from '@/lib/chat-errors'

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
  checkForRateLimitError: (error: unknown) => boolean
}

interface RateLimitInfo {
  resetTime?: string | number
  userLimit?: boolean
  message?: string
}

type UnknownRecord = Record<string, unknown>

type RateLimitWindow = Window & { __rateLimitFetchWrapped?: boolean }

const normalizeResetInput = (value: string | number | undefined): string | undefined => {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : value.toString()
}

/** Keeps reset hints the normaliser understands (strings and numbers); drops anything else. */
const toResetInput = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined

/** Server-provided message fields are usually strings; stringify anything else that's present. */
const toMessage = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : String(value)
}

/**
 * Views a parsed JSON payload as a record of unknown fields. Like the property reads it
 * guards, it throws for `null`/`undefined`; other non-objects simply have no fields.
 */
const toPayload = (parsed: unknown): UnknownRecord => {
  if (parsed === null || parsed === undefined) {
    throw new TypeError('Empty rate limit payload')
  }
  return isRecord(parsed) ? parsed : {}
}

const RateLimitContext = createContext<RateLimitContextType | undefined>(undefined)

export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(null)

  const clearRateLimitError = useCallback(() => {
    setRateLimitError(null)
  }, [])

  const trySet = useCallback((info: RateLimitInfo) => {
    let normalizedReset: string | undefined = undefined
    const raw = info.resetTime
    if (raw !== undefined && raw !== null) {
      try {
        if (typeof raw === 'number') {
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
    setRateLimitError(payload)
  }, [])
  /** Structured check: HTTP 429 / our JSON rate-limit body (see `classifyChatError`). */
  const checkForRateLimitError = useCallback(
    (error: unknown): boolean => {
      if (!error) return false
      const classified = classifyChatError(error)
      if (classified.kind !== 'rate_limit') return false
      trySet({
        resetTime: classified.resetTime,
        userLimit: classified.scope === 'user',
        message: classified.message ?? 'rate limit exceeded. please try again later.',
      })
      return true
    },
    [trySet]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const rateLimitWindow: RateLimitWindow = window
    const nativeFetch = window.fetch
    let wrapped = false

    if (rateLimitWindow.__rateLimitFetchWrapped) return
    rateLimitWindow.__rateLimitFetchWrapped = true

    const newFetch: typeof window.fetch = async (input, init) => {
      try {
        const res = await nativeFetch(input, init)
        if (res.status === 429) {
          try {
            const clone = res.clone()
            const ct = clone.headers.get('content-type') || ''
            if (ct.includes('application/json')) {
              const json = toPayload(await clone.json())
              const msg = toMessage(json.message || json.error || JSON.stringify(json))
              let resetRaw = toResetInput(
                json.resetTime || json.reset_at || json.reset || json.retry_after
              )
              const raHeader =
                clone.headers.get('Retry-After') ||
                clone.headers.get('retry-after') ||
                clone.headers.get('x-rate-limit-reset') ||
                clone.headers.get('x-ratelimit-reset')
              if (!resetRaw && raHeader) resetRaw = raHeader
              const reset = normalizeResetInput(resetRaw)
              trySet({ resetTime: reset, userLimit: json.type === 'user_rate_limit', message: msg })
              try {
                // eslint-disable-next-line no-console
              } catch {}
            } else {
              const bodyText = await clone.text()
              try {
                const parsed = toPayload(JSON.parse(bodyText))
                const msg = toMessage(parsed.message || parsed.error || JSON.stringify(parsed))
                let resetRaw = toResetInput(
                  parsed.resetTime || parsed.reset_at || parsed.reset || parsed.retry_after
                )
                const raHeader =
                  clone.headers.get('Retry-After') ||
                  clone.headers.get('retry-after') ||
                  clone.headers.get('x-rate-limit-reset') ||
                  clone.headers.get('x-ratelimit-reset')
                if (!resetRaw && raHeader) resetRaw = raHeader
                const reset = normalizeResetInput(resetRaw)
                trySet({
                  resetTime: reset,
                  userLimit: parsed.type === 'user_rate_limit',
                  message: msg,
                })
                try {
                  // eslint-disable-next-line no-console
                } catch {}
              } catch {
                const ra =
                  res.headers.get('Retry-After') ||
                  res.headers.get('retry-after') ||
                  res.headers.get('x-rate-limit-reset') ||
                  res.headers.get('x-ratelimit-reset')
                if (ra) {
                  const sec = parseInt(ra, 10)
                  if (!isNaN(sec)) {
                    trySet({
                      resetTime: new Date(Date.now() + sec * 1000).toISOString(),
                      message: 'rate limit exceeded. please try again later.',
                    })
                  } else {
                    trySet({
                      resetTime: ra,
                      message: 'rate limit exceeded. please try again later.',
                    })
                  }
                } else {
                  trySet({ message: 'rate limit exceeded. please try again later.' })
                }
              }
            }
            try {
              // eslint-disable-next-line no-console
            } catch {}
          } catch (e) {
            trySet({ message: 'rate limit exceeded. please try again later.' })
          }
        }
        return res
      } catch (err) {
        throw err
      }
    }

    try {
      window.fetch = newFetch
      wrapped = true
    } catch (e) {
    }

    return () => {
      try {
        if (wrapped) window.fetch = nativeFetch
        rateLimitWindow.__rateLimitFetchWrapped = false
      } catch {}
    }
  }, [trySet])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      try {
        const reason: unknown = (ev && ev.reason) || ev
        if (checkForRateLimitError(reason)) {
        }
      } catch (e) {
      }
    }

    window.addEventListener('unhandledrejection', onUnhandled)

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [checkForRateLimitError])

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
