'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'

const UpsellBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    const checkAndShowUpsell = () => {
      const hasSeenResearchPreview = localStorage.getItem('has-seen-upsell-banner')
      const hasSeenFeedback = localStorage.getItem('has-seen-feedback-banner')
      const onboardingCompleted = localStorage.getItem('onboarding-completed')
      const researchDismissed = localStorage.getItem('research-banner-dismissed')
      const feedbackDismissed = localStorage.getItem('feedback-banner-dismissed')

      if (onboardingCompleted === 'true') {
        if (hasSeenResearchPreview && !hasSeenFeedback && !feedbackDismissed) {
          setShowFeedback(true)
          setTimeout(() => setIsVisible(true), 3000)
        } else if (!hasSeenResearchPreview && !researchDismissed) {
          setShowFeedback(false)
          setTimeout(() => setIsVisible(true), 3000)
        }
      }
    }

    checkAndShowUpsell()

    const handleOnboardingComplete = () => {
      setTimeout(checkAndShowUpsell, 500)
    }

    window.addEventListener('onboardingCompleted', handleOnboardingComplete)

    return () => {
      window.removeEventListener('onboardingCompleted', handleOnboardingComplete)
    }
  }, [])

  const handleClose = () => {
    if (showFeedback) {
      localStorage.setItem('has-seen-feedback-banner', 'true')
      localStorage.setItem('feedback-banner-dismissed', 'true')
    } else {
      localStorage.setItem('has-seen-upsell-banner', 'true')
      localStorage.setItem('research-banner-dismissed', 'true')
    }
    setIsDismissed(true)
    setIsVisible(false)
  }

  const handleOpenSettings = () => {
    const event = new CustomEvent('openSettings', { detail: { section: 'feedback' } })
    window.dispatchEvent(event)
    handleClose()
  }

  if (!isVisible || isDismissed) return null

  if (isMobile) {
    return (
      <div className="fixed top-12 left-0 right-0 z-40 mx-2 mb-2">
        <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700">
          <Button
            onClick={handleClose}
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 rounded-full p-1 bg-black/50 dark:bg-black/60 text-white hover:bg-black/70 border border-white/20 shadow-sm z-20"
            aria-label="close"
          >
            <X className="h-5 w-5" />
          </Button>


          <div className="relative h-16 overflow-hidden">
            <Image
              src={
                showFeedback
                  ? '/onboarding-artwork/artwork2.png'
                  : '/onboarding-artwork/artwork.png'
              }
              alt={showFeedback ? 'Feedback artwork' : 'Research Preview artwork'}
              fill
              className="object-cover object-center"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center space-x-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {showFeedback ? 'help us improve' : 'research preview'}
              </h2>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
              {showFeedback
                ? 'your feedback helps us build better features. share your thoughts, report bugs, or suggest improvements.'
                : "this is an early research preview. features may change or be removed without notice. we're improving the experience based on your feedback."}
            </p>

            {showFeedback && (
              <Button
                onClick={handleOpenSettings}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-xl font-medium text-sm shadow-md transition-all duration-300"
              >
                <Settings className="w-4 h-4 mr-2" />
                open settings
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80">
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700">
        <Button
          onClick={handleClose}
          variant="ghost"
          size="sm"
          className="absolute right-3 top-3 rounded-full p-1 bg-black/50 dark:bg-black/60 text-white hover:bg-black/70 border border-white/20 shadow-sm z-20"
          aria-label="close"
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="relative h-24 sm:h-32 overflow-hidden">
          <Image
            src={
              showFeedback ? '/onboarding-artwork/artwork2.png' : '/onboarding-artwork/artwork3.png'
            }
            alt={showFeedback ? 'Feedback artwork' : 'Research Preview artwork'}
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
        </div>

        <div className="flex-1 relative">
          <div className="h-full flex flex-col px-5 py-2 sm:px-8 sm:py-4">
            <div className="flex-1 min-h-0">
              <div className="flex items-center space-x-3 mb-3">

                <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                  {showFeedback ? 'help us improve' : 'research preview'}
                </h2>
              </div>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                {showFeedback
                  ? 'your feedback is invaluable to us. share your thoughts, report bugs, or suggest new features to help us build a better experience for everyone.'
                  : 'this is an early research preview.'}
              </p>

              {!showFeedback && (
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                  features may change or be removed without notice. we're improving the experience
                  based on your feedback.
                </p>
              )}

              <div className="mt-6 mb-3">
                {showFeedback && (
                  <Button
                    onClick={handleOpenSettings}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                  >
                    <Settings className="w-5 h-5 mr-2" />
                    open settings
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UpsellBanner
