'use client'

import { useEffect } from 'react'

export function PerformanceMonitor() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          if (entry.duration > 100) {
            console.warn(`Long task detected: ${entry.duration.toFixed(0)}ms`)
          }
        })
      })

      try {
        observer.observe({ entryTypes: ['longtask'] })
      } catch (e) {
      }

      return () => {
        observer.disconnect()
      }
    }
  }, [])

  return null
}
