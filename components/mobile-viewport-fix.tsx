'use client'

import { useEffect } from 'react'

export default function MobileViewportFix() {
  useEffect(() => {
    // Fix for mobile browser address bar issues
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }    // Set initial height
    setAppHeight()

    // Update height on resize and orientation change
    window.addEventListener('resize', setAppHeight)
    window.addEventListener('orientationchange', () => {
      setAppHeight()
      // Scroll to top after orientation change to ensure header visibility
      window.scrollTo(0, 0)
    })
    
    // Prevent automatic scrolling to bottom on page load
    window.scrollTo(0, 0)
    
    // Also apply a small delay to ensure browser has fully rendered
    setTimeout(() => {
      window.scrollTo(0, 0)
    }, 100)

    // Handle mobile keyboard appearance
    const setKeyboardVisible = () => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        document.body.classList.add('keyboard-visible')
      } else {
        document.body.classList.remove('keyboard-visible')
      }
    }
    
    document.addEventListener('focusin', setKeyboardVisible)
    document.addEventListener('focusout', setKeyboardVisible)
    
    // Prevent overscroll/bounce effect
    const preventOverscroll = (e: TouchEvent) => {
      // Only prevent default if this is not in an overflow-fix element
      if (!e.target || !(e.target as Element).closest('.overflow-fix')) {
        e.preventDefault()
      }
    }
    
    document.addEventListener('touchmove', preventOverscroll as EventListener, { passive: false })

    return () => {
      window.removeEventListener('resize', setAppHeight)
      window.removeEventListener('orientationchange', setAppHeight)
      document.removeEventListener('focusin', setKeyboardVisible)
      document.removeEventListener('focusout', setKeyboardVisible)
      document.removeEventListener('touchmove', preventOverscroll as EventListener)
    }
  }, [])

  return null
}
