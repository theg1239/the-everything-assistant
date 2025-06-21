'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface PerformanceContextType {
  reduceAnimations: boolean
  isLowPerformance: boolean
}

const PerformanceContext = createContext<PerformanceContextType>({
  reduceAnimations: false,
  isLowPerformance: false,
})

export const usePerformance = () => useContext(PerformanceContext)

interface PerformanceProviderProps {
  children: ReactNode
}

export function PerformanceProvider({ children }: PerformanceProviderProps) {
  const [reduceAnimations, setReduceAnimations] = useState(false)
  const [isLowPerformance, setIsLowPerformance] = useState(false)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setReduceAnimations(true)
    }

    let longTaskCount = 0
    const resetCounter = () => {
      longTaskCount = 0
    }

    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          if (entry.duration > 50) {
            longTaskCount++

            if (longTaskCount > 5) {
              setReduceAnimations(true)
              setIsLowPerformance(true)
              console.warn('Performance degraded, reducing animations')
            }
          }
        })
      })

      try {
        observer.observe({ entryTypes: ['longtask'] })
      } catch (e) {}

      const interval = setInterval(resetCounter, 10000)

      return () => {
        observer.disconnect()
        clearInterval(interval)
      }
    }
  }, [])

  return (
    <PerformanceContext.Provider value={{ reduceAnimations, isLowPerformance }}>
      {children}
    </PerformanceContext.Provider>
  )
}
