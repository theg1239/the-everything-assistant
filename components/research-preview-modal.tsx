'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, Beaker } from 'lucide-react'
import { Button } from '@/components/ui/button'

const AUTO_DISMISS_DURATION = 5000 // 5 seconds

const ResearchPreviewModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [progress, setProgress] = useState(100)

  const handleClose = useCallback(() => {
    localStorage.setItem('has-seen-research-preview', 'true')
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const checkAndShowModal = () => {
      const hasSeenWelcome = localStorage.getItem('has-seen-research-preview')
      const onboardingCompleted = localStorage.getItem('onboarding-completed')

      if (!hasSeenWelcome && onboardingCompleted === 'true') {
        setIsOpen(true)
      }
    }

    checkAndShowModal()

    const handleOnboardingComplete = () => {
      setTimeout(checkAndShowModal, 500)
    }

    window.addEventListener('onboardingCompleted', handleOnboardingComplete)

    return () => {
      window.removeEventListener('onboardingCompleted', handleOnboardingComplete)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const startTime = Date.now()
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_DURATION) * 100)
      setProgress(remaining)
      
      if (remaining <= 0) {
        handleClose()
      }
    }, 50)

    return () => clearInterval(intervalId)
  }, [isOpen, handleClose])

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl border border-slate-700">
        {/* Auto-dismiss progress bar */}
        <div className="h-1 bg-slate-700/50 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-slate-400 to-slate-300 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="flex justify-end px-4 pt-3">
          <Button
            onClick={handleClose}
            variant="ghost"
            size="sm"
            className="rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          <div className="mb-5 flex justify-center">
            <div className="rounded-full border-2 border-slate-700 bg-gradient-to-br from-slate-800 to-slate-700 p-4 shadow-inner">
              <Beaker className="h-9 w-9 text-slate-200" />
            </div>
          </div>

          <h4 className="mb-2 text-2xl font-medium text-white">Research Preview</h4>
          <p className="mb-8  text-slate-300">
            This is an early research preview. Features may change or be removed without notice.
            We're improving the experience based on your feedback.
          </p>

          <Button
            onClick={handleClose}
            className="w-full rounded-full bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:from-slate-600 hover:to-slate-700"
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ResearchPreviewModal
