'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { isRecord } from '@/lib/json'

interface RateLimitError {
  isRateLimit: boolean
  resetTime?: string
  userLimit?: boolean
  message?: string
  estimated?: boolean
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

const asOptionalRecord = (value: unknown): UnknownRecord | undefined =>
  value !== null && typeof value === 'object' ? (isRecord(value) ? value : {}) : undefined

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

    let estimated = false

    if (!normalizedReset) {
      const msg = String(info.message || '').toLowerCase()
      const overloadedHint =
        msg.includes('try again later') ||
        msg.includes('overload') ||
        msg.includes('overloaded') ||
        msg.includes('temporarily')
      if (overloadedHint) {
        const numericHint = msg.match(
          /(\d+)\s*(seconds|second|secs|sec|minutes|minute|mins|min|hours|hour|hrs|hr)/i
        )
        if (numericHint) {
          const [hintText, amount = '', unitText] = numericHint
          const n = parseInt(amount, 10)
          const unit = String(unitText || '').toLowerCase()
          let ms: number | undefined
          if (unit.startsWith('sec')) ms = n * 1000
          else if (unit.startsWith('min')) ms = n * 60 * 1000
          else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = n * 60 * 60 * 1000
          if (ms !== undefined) {
            normalizedReset = new Date(Date.now() + ms).toISOString()
            estimated = true
          } else {
            try {
              // eslint-disable-next-line no-console
              console.debug(
                '[RateLimit] numeric hint with unknown unit; skipping estimate:',
                hintText
              )
            } catch {}
          }
        } else {
          try {
            // eslint-disable-next-line no-console
            console.debug(
              '[RateLimit] overload hint found but no numeric hint; skipping estimated reset'
            )
          } catch {}
        }
      }
    }

    const payload: RateLimitError = {
      isRateLimit: true,
      resetTime: normalizedReset,
      userLimit: info.userLimit ?? false,
      message: info.message,
      estimated,
    }
    try {
    } catch {}
    setRateLimitError(payload)
  }, [])
  const checkForRateLimitError = useCallback((error: unknown): boolean => {
    if (!error) return false

    const err = asOptionalRecord(error)
    const response = asOptionalRecord(err?.response)

    const status = err?.status || err?.statusCode || response?.status
    if (status === 429) {
      const body = err?.responseBody || err?.body || response?.body || null
      if (body && typeof body === 'string') {
        try {
          const parsed = toPayload(JSON.parse(body))
          const msg = parsed.message || parsed.error || parsed.detail || parsed.error_description
          const numericRequestsPattern =
            /(\d+\s*requests?)\s*(per|\/)?\s*(second|sec|minute|min|hour|hr)/i
          const userPattern =
            /you have exceeded|exceeded your rate limit|user_rate_limit|requests?\s+per\s+(minute|hour|second)|requests?\/minute|per minute/i
          const userLimit =
            parsed.type === 'user_rate_limit' ||
            /user/i.test(String(msg || '')) ||
            numericRequestsPattern.test(String(msg || '')) ||
            userPattern.test(String(msg || ''))
          trySet({
            resetTime: toResetInput(parsed.resetTime || parsed.reset_at || parsed.reset || undefined),
            userLimit,
            message: toMessage(msg),
          })
          try {
          } catch {}
          return true
        } catch {
          trySet({ message: 'rate limit exceeded. please try again later.' })
          return true
        }
      }
      trySet({ message: 'rate limit exceeded. please try again later.' })
      return true
    }

    const responseBody = err?.responseBody
    if (responseBody && typeof responseBody === 'string') {
      const txt = responseBody.trim()
      if (txt) {
        if (
          txt.toLowerCase().includes('rate limit') ||
          txt.toLowerCase().includes('too many requests') ||
          txt.includes('RATE_LIMIT')
        ) {
          try {
            const parsed = toPayload(JSON.parse(txt))
            const msg = parsed.message || parsed.error || parsed.detail
            const numericRequestsPattern =
              /(\d+\s*requests?)\s*(per|\/)?\s*(second|sec|minute|min|hour|hr)/i
            const userPattern =
              /you have exceeded|exceeded your rate limit|user_rate_limit|requests?\s+per\s+(minute|hour|second)|requests?\/minute|per minute/i
            const userLimit =
              parsed.type === 'user_rate_limit' ||
              /user/i.test(String(msg || '')) ||
              numericRequestsPattern.test(String(msg || '')) ||
              userPattern.test(String(msg || ''))
            trySet({
              resetTime: toResetInput(parsed.resetTime || parsed.reset_at),
              userLimit,
              message: toMessage(msg),
            })
            try {
            } catch {}
            return true
          } catch {
            trySet({ message: txt })
            return true
          }
        }
      }
    }

    const errorMessage = String(err?.message || String(error) || '')
    const lower = errorMessage.toLowerCase()
    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('quota exceeded') ||
      lower.includes('rate_limited') ||
      lower.includes('rate_limit')
    ) {
      const idx = errorMessage.indexOf('429:')
      if (idx !== -1) {
        const jsonPart = errorMessage.slice(idx + 4).trim()
        try {
          const parsed = toPayload(JSON.parse(jsonPart))
          const msg = parsed.message || parsed.error
          const numericRequestsPattern =
            /(\d+\s*requests?)\s*(per|\/)?\s*(second|sec|minute|min|hour|hr)/i
          const userPattern =
            /you have exceeded|exceeded your rate limit|user_rate_limit|requests?\s+per\s+(minute|hour|second)|requests?\/minute|per minute/i
          const userLimit =
            parsed.type === 'user_rate_limit' ||
            /user/i.test(String(msg || '')) ||
            numericRequestsPattern.test(String(msg || '')) ||
            userPattern.test(String(msg || ''))
          trySet({
            resetTime: toResetInput(parsed.resetTime || parsed.reset_at),
            userLimit,
            message: toMessage(msg),
          })
          return true
        } catch {}
      }

      const numericRequestsPattern2 =
        /(\d+\s*requests?)\s*(per|\/)?\s*(second|sec|minute|min|hour|hr)/i
      const isUserLimit =
        lower.includes('user') ||
        lower.includes('you have exceeded') ||
        numericRequestsPattern2.test(lower) ||
        lower.includes('requests per')
      trySet({
        userLimit: isUserLimit,
        message: isUserLimit
          ? 'you have exceeded your rate limit. please wait before sending another message.'
          : 'rate limit exceeded. please try again later.',
      })
      return true
    }

    return false
  }, [])

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
