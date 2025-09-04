'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

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
  checkForRateLimitError: (error: any) => boolean
}

const RateLimitContext = createContext<RateLimitContextType | undefined>(undefined)

export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(null)

  const clearRateLimitError = useCallback(() => {
    setRateLimitError(null)
  }, [])

  const trySet = useCallback((info: Partial<RateLimitError>) => {
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

    let estimated = false

    // If there's no normalized reset but message suggests transient overload, infer a small estimate.
    if (!normalizedReset) {
      const msg = String(info.message || '').toLowerCase()
      const overloadedHint =
        msg.includes('try again later') ||
        msg.includes('overload') ||
        msg.includes('overloaded') ||
        msg.includes('temporarily')
      if (overloadedHint) {
        // Look for a numeric hint like '2 minutes' or '10 sec'
        const numericHint = msg.match(
          /(\d+)\s*(seconds|second|secs|sec|minutes|minute|mins|min|hours|hour|hrs|hr)/i
        )
        if (numericHint) {
          const n = parseInt(numericHint[1], 10)
          const unit = String(numericHint[2] || '').toLowerCase()
          let ms = undefined as number | undefined
          if (unit.startsWith('sec')) ms = n * 1000
          else if (unit.startsWith('min')) ms = n * 60 * 1000
          else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = n * 60 * 60 * 1000
          if (ms !== undefined) {
            normalizedReset = new Date(Date.now() + ms).toISOString()
            estimated = true
          } else {
            // numeric hint present but unknown unit; do not estimate
            try {
              // eslint-disable-next-line no-console
              console.debug(
                '[RateLimit] numeric hint with unknown unit; skipping estimate:',
                numericHint[0]
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
      //console.debug('[RateLimit] setting rate limit error in context:', payload)
    } catch {}
    setRateLimitError(payload)
  }, [])
  const checkForRateLimitError = useCallback((error: any): boolean => {
    if (!error) return false

    // console.debug('[RateLimit] checkForRateLimitError received:', error)

    const status = error?.status || error?.statusCode || error?.response?.status
    if (status === 429) {
      const body = error?.responseBody || error?.body || error?.response?.body || null
      if (body && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body)
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
            resetTime: parsed.resetTime || parsed.reset_at || parsed.reset || undefined,
            userLimit,
            message: msg,
          })
          try {
            // console.debug('[RateLimit] parsed 429 body (checkForRateLimitError); userLimit=', userLimit, 'msg=', String(msg).slice(0, 200))
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

    const responseBody = error?.responseBody
    if (responseBody && typeof responseBody === 'string') {
      const txt = responseBody.trim()
      if (txt) {
        if (
          txt.toLowerCase().includes('rate limit') ||
          txt.toLowerCase().includes('too many requests') ||
          txt.includes('RATE_LIMIT')
        ) {
          try {
            const parsed = JSON.parse(txt)
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
            trySet({ resetTime: parsed.resetTime || parsed.reset_at, userLimit, message: msg })
            try {
              //console.debug('[RateLimit] parsed responseBody JSON; userLimit=', userLimit)
            } catch {}
            return true
          } catch {
            trySet({ message: txt })
            return true
          }
        }
      }
    }

    const errorMessage = String(error?.message || error?.toString() || '')
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
          const parsed = JSON.parse(jsonPart)
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
          trySet({ resetTime: parsed.resetTime || parsed.reset_at, userLimit, message: msg })
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

    const nativeFetch = window.fetch
    let wrapped = false

    if ((window as any).__rateLimitFetchWrapped) return
    ;(window as any).__rateLimitFetchWrapped = true

    const newFetch: any = async (input: any, init?: any) => {
      try {
        const res = await nativeFetch(input, init)
        if (res.status === 429) {
          try {
            const clone = res.clone()
            const ct = clone.headers.get('content-type') || ''
            if (ct.includes('application/json')) {
              const json = await clone.json()
              const msg = json.message || json.error || JSON.stringify(json)
              let reset = json.resetTime || json.reset_at || json.reset || json.retry_after
              const raHeader =
                clone.headers.get('Retry-After') ||
                clone.headers.get('retry-after') ||
                clone.headers.get('x-rate-limit-reset') ||
                clone.headers.get('x-ratelimit-reset')
              if (!reset && raHeader) reset = raHeader
              trySet({ resetTime: reset, userLimit: json.type === 'user_rate_limit', message: msg })
              try {
                // eslint-disable-next-line no-console
                //console.debug('[RateLimit] parsed JSON 429 body; reset sourced from', reset ? 'body/header' : 'none', 'reset=', reset)
              } catch {}
            } else {
              const bodyText = await clone.text()
              try {
                const parsed = JSON.parse(bodyText)
                const msg = parsed.message || parsed.error || JSON.stringify(parsed)
                let reset =
                  parsed.resetTime || parsed.reset_at || parsed.reset || parsed.retry_after
                const raHeader =
                  clone.headers.get('Retry-After') ||
                  clone.headers.get('retry-after') ||
                  clone.headers.get('x-rate-limit-reset') ||
                  clone.headers.get('x-ratelimit-reset')
                if (!reset && raHeader) reset = raHeader
                trySet({
                  resetTime: reset,
                  userLimit: parsed.type === 'user_rate_limit',
                  message: msg,
                })
                try {
                  // eslint-disable-next-line no-console
                  //console.debug('[RateLimit] parsed text 429 body JSON; reset sourced from', reset ? 'body/header' : 'none', 'reset=', reset)
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
            // debug log
            try {
              // eslint-disable-next-line no-console
              //console.debug('[RateLimit] intercepted 429 for', String(input).slice(0, 200))
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
      ;(window as any).fetch = newFetch
      wrapped = true
    } catch (e) {
      // ignore
    }

    return () => {
      try {
        if (wrapped) (window as any).fetch = nativeFetch
        ;(window as any).__rateLimitFetchWrapped = false
      } catch {}
    }
  }, [trySet])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      try {
        const reason = (ev && (ev as any).reason) || ev
        if (checkForRateLimitError(reason)) {
        }
      } catch (e) {
        // ignore
      }
    }

    window.addEventListener('unhandledrejection', onUnhandled as EventListener)

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandled as EventListener)
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
