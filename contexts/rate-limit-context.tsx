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

    //console.log('Checking error for rate limit:', error)

    const errorMessage = error.message || error.toString()

    //console.log('Error message:', errorMessage)

    if (
      errorMessage.includes('429') ||
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.toLowerCase().includes('too many requests') ||
      errorMessage.toLowerCase().includes('an error occurred')
    ) {
      //console.log('Rate limit error detected!')

      try {
        let errorData: any = {}

        if (errorMessage.includes('429:')) {
          const jsonPart = errorMessage.split('429:')[1]?.trim()
          if (jsonPart) {
            errorData = JSON.parse(jsonPart)
          }
        }

        const rateLimitInfo: RateLimitError = {
          isRateLimit: true,
          resetTime: errorData.resetTime,
          userLimit:
            errorData.error?.includes('user') ||
            errorData.userLimit ||
            errorMessage.toLowerCase().includes('user rate limit'),
          message:
            errorData.error ||
            (errorMessage.toLowerCase().includes('user')
              ? 'you have exceeded your rate limit. please wait before sending another message.'
              : 'rate limit exceeded. please try again later.'),
        }

        //console.log('💾 Setting rate limit error:', rateLimitInfo)
        setRateLimitError(rateLimitInfo)
        return true
      } catch (parseError) {
        //console.log('Failed to parse error data, using fallback')
        const isUserLimit = errorMessage.toLowerCase().includes('user')
        const fallbackError = {
          isRateLimit: true,
          userLimit: isUserLimit,
          message: isUserLimit
            ? 'you have exceeded your rate limit. please wait before sending another message.'
            : 'rate limit exceeded. please try again later.',
        }
        //console.log('Setting fallback rate limit error:', fallbackError)
        setRateLimitError(fallbackError)
        return true
      }
    }

    //console.log('Not a rate limit error')
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
