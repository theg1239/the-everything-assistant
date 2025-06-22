'use client'

import { useState, useEffect } from 'react'

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true)
  useEffect(() => {
    const onboardingCompleted = localStorage.getItem('onboarding-completed')
    const hasSeenBefore = onboardingCompleted === 'true'

    setHasSeenOnboarding(hasSeenBefore)

    const handleTriggerOnboarding = () => {
      //console.log('triggerOnboarding event received!')
      setShowOnboarding(true)
    }

    window.addEventListener('triggerOnboarding', handleTriggerOnboarding)

    if (!hasSeenBefore) {
      const timer = setTimeout(() => {
        setShowOnboarding(true)
      }, 1) 

      return () => {
        clearTimeout(timer)
        window.removeEventListener('triggerOnboarding', handleTriggerOnboarding)
      }
    }

    return () => {
      window.removeEventListener('triggerOnboarding', handleTriggerOnboarding)
    }
  }, [])

  const triggerOnboarding = () => {
    setShowOnboarding(true)
  }

  const closeOnboarding = () => {
    //console.log('closeOnboarding called')
    setShowOnboarding(false)
  }

  //console.log('useOnboarding hook state:', { showOnboarding, hasSeenOnboarding })

  const resetOnboarding = () => {
    localStorage.removeItem('onboarding-completed')
    setHasSeenOnboarding(false)
    setShowOnboarding(true)
  }

  return {
    showOnboarding,
    hasSeenOnboarding,
    triggerOnboarding,
    closeOnboarding,
    resetOnboarding,
  }
}
