'use client'

import { useEffect } from 'react'

export default function MobileViewportFix() {
  useEffect(() => {
    // Fix for mobile browser address bar issues
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
      
      // Force scroll to top to ensure header visibility
      window.scrollTo(0, 0)
    }
    
    // Set initial height
    setAppHeight()

    // Update height on resize and orientation change
    window.addEventListener('resize', setAppHeight)
    window.addEventListener('orientationchange', () => {
      // Delay setting height slightly after orientation change
      setTimeout(() => {
        setAppHeight()
        // Force scroll to top after orientation change to ensure header visibility
        window.scrollTo(0, 0)
      }, 100)
    })
    
    // When virtual keyboard appears/disappears on mobile
    const visualViewportHandler = () => {
      // Check if we're on a mobile device
      if (window.innerWidth <= 768) {
        if (window.visualViewport) {
          document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport.height}px`)
        }
        
        // Force header to be visible by scrolling to top
        if (document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
          window.scrollTo(0, 0)
        }
      }
    }
    
    // Handle mobile keyboard appearance
    const setKeyboardVisible = () => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        document.body.classList.add('keyboard-visible')
        // When keyboard is visible, avoid header overlap by disabling position fixed temporarily
        document.querySelectorAll('.chat-page-header').forEach(el => {
          el.classList.add('keyboard-active')
        })
      } else {
        document.body.classList.remove('keyboard-visible')
        document.querySelectorAll('.chat-page-header').forEach(el => {
          el.classList.remove('keyboard-active')
        })
        // When keyboard is dismissed, scroll to top to show header
        window.scrollTo(0, 0)
      }
    }

    // Add visual viewport handler if available
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', visualViewportHandler)
    }
    
    document.addEventListener('focusin', setKeyboardVisible)
    document.addEventListener('focusout', setKeyboardVisible)
    
    // Prevent overscroll/bounce effect on iOS
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
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', visualViewportHandler)
      }
      document.removeEventListener('focusin', setKeyboardVisible)
      document.removeEventListener('focusout', setKeyboardVisible)
      document.removeEventListener('touchmove', preventOverscroll as EventListener)
    }
  }, [])

  return null
}
