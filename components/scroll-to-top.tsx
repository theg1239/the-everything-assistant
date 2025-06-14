'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

export default function ScrollToTop() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Scroll to top on page navigation
    window.scrollTo(0, 0)
    
    // Add a small delay to ensure rendering is complete
    const timeoutId = setTimeout(() => {
      window.scrollTo(0, 0)
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [pathname, searchParams])

  return null
}
