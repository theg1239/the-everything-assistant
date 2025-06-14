'use client'

import { useEffect } from 'react'

export default function MobileViewportFix() {
  useEffect(() => {
    const setAppHeight = () => {
      const doc = document.documentElement
      const viewport = window.visualViewport
      const height = viewport ? viewport.height : window.innerHeight
      doc.style.setProperty('--app-height', `${height}px`)
      
      if (document.activeElement?.tagName !== 'INPUT' && 
          document.activeElement?.tagName !== 'TEXTAREA') {
        window.scrollTo(0, 0)
      }
    }

    const handleKeyboardVisibility = (isVisible: boolean) => {
      document.body.classList.toggle('keyboard-visible', isVisible)
      
      if (!isVisible) {
        requestAnimationFrame(() => {
          window.scrollTo(0, 0)
        })
      }
    }

    const handleViewportChange = () => {
      setAppHeight()
      
      const viewport = window.visualViewport
      if (viewport) {
        const isKeyboardVisible = viewport.height < window.innerHeight * 0.8
        handleKeyboardVisibility(isKeyboardVisible)
      }
    }

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        handleKeyboardVisibility(true)
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }

    const handleFocusOut = () => {
      handleKeyboardVisibility(false)
    }

    const preventOverscroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (!target?.closest('.chat-content')) {
        e.preventDefault()
      }
    }

    // Initial setup
    setAppHeight()
    
    // Event listeners
    window.addEventListener('resize', setAppHeight)
    const viewport = window.visualViewport
    if (viewport) {
      viewport.addEventListener('resize', handleViewportChange)
      viewport.addEventListener('scroll', handleViewportChange)
    }
    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)
    window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 100))
    document.addEventListener('touchmove', preventOverscroll, { passive: false })

    // Cleanup
    return () => {
      window.removeEventListener('resize', setAppHeight)
      if (viewport) {
        viewport.removeEventListener('resize', handleViewportChange)
        viewport.removeEventListener('scroll', handleViewportChange)
      }
      window.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('touchmove', preventOverscroll)
    }
  }, [])

  return null
}