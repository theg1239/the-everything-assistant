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

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const slides = payload?.slides || []
  const currentSlide = slides[currentStep]

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

  const ChevronNavigation = () => {
    if (!isMounted || slides.length <= 1) return null

    return (
      <>
        {createPortal(
          <>
            <button
              data-chevron
              onClick={prevStep}
              className={cn(
                'fixed top-1/2 -translate-y-1/2 left-2 sm:left-4 z-50 p-2 rounded-full bg-white/50 dark:bg-black/50 backdrop-blur-sm shadow-lg hover:scale-110 transition-transform',
                currentStep === 0 ? 'opacity-0 pointer-events-none' : ''
              )}
            >
              <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
            <button
              data-chevron
              onClick={nextStep}
              className={cn(
                'fixed top-1/2 -translate-y-1/2 right-2 sm:right-4 z-50 p-2 rounded-full bg-white/50 dark:bg-black/50 backdrop-blur-sm shadow-lg hover:scale-110 transition-transform',
                currentStep >= slides.length - 1
                  ? 'opacity-0 pointer-events-none'
                  : ''
              )}
            >
              <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
          </>,
          document.body
        )}
      </>
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
          <div className="flex-1 relative">
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
