'use client'

import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 100) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)

    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <>
      {isVisible && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-24 right-4 z-50 rounded-full w-10 h-10 flex items-center justify-center shadow-lg bg-primary hover:bg-primary/90"
          aria-label="Scroll to top"
        >
          <ArrowUp size={18} />
        </Button>
      )}
    </>
  )
}
