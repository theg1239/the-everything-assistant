'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Slide {
  title: string
  text: string
  image: string
}

interface BroadcastDialogProps {
  isOpen: boolean
  onClose: () => void
  payload: {
    slides: Slide[]
  } | null
}

export function BroadcastDialog({ isOpen, onClose, payload }: BroadcastDialogProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isMounted, setIsMounted] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const slides = payload?.slides || []
  const currentSlide = slides[currentStep]
  const minSwipeDistance = 50

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  const nextStep = () => {
    if (currentStep < slides.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number) => {
    setCurrentStep(step)
  }

  const handleFinish = () => {
    onClose()
  }

  // Touch handlers for swipe support
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && currentStep < slides.length - 1) {
      nextStep()
    }
    if (isRightSwipe && currentStep > 0) {
      prevStep()
    }
  }

  // Updated chevron navigation based on OnboardingDialog approach
  const ChevronNavigation = () => {
    if (!isMounted || slides.length <= 1 || !isOpen) return null

    return createPortal(
      <div className="fixed inset-0 pointer-events-none z-[60] flex items-center justify-center">
        <div className="relative max-w-md w-[95vw] flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            data-chevron="left"
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              prevStep()
            }}
            disabled={currentStep === 0}
            className="absolute left-[-60px] sm:left-[-80px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto shadow-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            data-chevron="right"
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              nextStep()
            }}
            disabled={currentStep >= slides.length - 1}
            className="absolute right-[-60px] sm:right-[-80px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white/90 dark:bg-slate-900/90 rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto shadow-lg backdrop-blur-sm"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
      </div>,
      document.body
    )
  }

  if (!isOpen || !currentSlide) return null

  return (
    <>
      <ChevronNavigation />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="max-w-md w-[95vw] bg-white dark:bg-slate-900 flex flex-col p-0 rounded-2xl shadow-2xl overflow-hidden h-auto max-h-[90vh] sm:max-h-[80vh] border-0"
          onPointerDownOutside={e => {
            const target = e.target as Element
            if (target.closest('button[data-chevron]')) {
              e.preventDefault()
            }
          }}
        >
          <DialogTitle className="sr-only">{currentSlide.title}</DialogTitle>
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/20 hover:bg-black/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="relative h-24 sm:h-32 overflow-hidden">
            <Image
              src={currentSlide.image}
              alt={`${currentSlide.title} artwork`}
              fill
              className="object-cover object-center"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>
          <div 
            className="flex-1 relative"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="h-full flex flex-col px-5 py-2 sm:px-8 sm:py-4">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="flex items-center space-x-3 mb-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                    {currentSlide.title}
                  </h2>
                </div>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                  {currentSlide.text}
                </p>
                {currentStep === slides.length - 1 && (
                  <div className="mt-6 mb-3">
                    <Button
                      onClick={handleFinish}
                      className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                    >
                      got it!
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-center space-x-2 py-3 mt-2 border-t border-slate-100 dark:border-slate-800">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300 hover:scale-110',
                      index === currentStep
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-sm'
                        : 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}