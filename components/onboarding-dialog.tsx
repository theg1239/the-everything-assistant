'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import {
  ChevronLeft,
  ChevronRight,
  X,
  GraduationCap,
  FileSearch,
  Calendar,
  UtensilsCrossed,
  MessageSquare,
  Sparkles,
  Shield,
  Zap,
  Star,
  Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface OnboardingDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: any
  gradient: string
  artworkImage: string
  examples: string[] | null
  isLastStep?: boolean
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'welcome to the everything assistant',
    description:
      'your ai-powered agentic companion for everything vit-related.',
    icon: Sparkles,
    gradient: 'from-purple-500 to-pink-500',
    artworkImage: '/onboarding-artwork/artwork.png',
    examples: ['what can you do?', 'tell me some things about VIT','can I ask you anything?'],
  },
  {
    id: 'vtop',
    title: 'vtop made simple',
    description:
      'check marks, attendance, timetable, and download course materials - all through natural conversation.',
    icon: GraduationCap,
    gradient: 'from-blue-500 to-cyan-500',
    artworkImage: '/onboarding-artwork/artwork2.png',
    examples: [
      'check my attendance for physics',
      'download course materials for DSA',
      'what classes do i have tomorrow',
    ],
  },
  {
    id: 'papers',
    title: 'past papers at your fingertips',
    description:
      'search across all vit paper repositories instantly. no more hunting through multiple websites. search by exam type, year.',
    icon: FileSearch,
    gradient: 'from-green-500 to-teal-500',
    artworkImage: '/onboarding-artwork/artwork3.png',
    examples: [
      'find cat1 papers for database systems',
      'calculus fat papers',
      'show me all physics past papers',
    ],
  },
  {
    id: 'campus',
    title: 'campus life made easy',
    description:
      'get mess menus, search the r/Vit subreddit and more subreddits, academic calendar & holidays, exam dates - everything.',
    icon: UtensilsCrossed,
    gradient: 'from-orange-500 to-red-500',
    artworkImage: '/onboarding-artwork/artwork4.png',
    examples: [
      'what does reddit think about placements?',
      'is there a holiday next week?',
      'when is FFCS?',
    ],
  },
  {
    id: 'security',
    title: 'secure and private',
    description:
      'your credentials are never stored. all sessions are encrypted and temporary - just like logging in yourself.',
    icon: Shield,
    gradient: 'from-indigo-500 to-purple-500',
    artworkImage: '/onboarding-artwork/artwork5.png',
    examples: [
      'how secure are you?',
      'what are your security measures?',
      'tell me about your privacy-first approach',
    ],
  },
  {
    id: 'get-started',
    title: 'ready to get started?',
    description:
      'your smart assistant is ready to help with all your vit needs. start chatting to experience the magic.',
    icon: Star,
    gradient: 'from-emerald-500 to-blue-500',
    artworkImage: '/onboarding-artwork/artwork6.png',
    examples: null,
    isLastStep: true,
  },
]

export function OnboardingDialog({ isOpen, onClose }: OnboardingDialogProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  // Reset to first step when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setDirection(0)
    }
  }, [isOpen])

  const minSwipeDistance = 50

  const nextStep = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setDirection(1)
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1)
    setCurrentStep(step)
  }

  const handleFinish = () => {
    localStorage.setItem('onboarding-completed', 'true')
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('onboardingCompleted'))
    
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

    if (isLeftSwipe && currentStep < onboardingSteps.length - 1) {
      nextStep()
    }
    if (isRightSwipe && currentStep > 0) {
      prevStep()
    }
  }

  const currentStepData = onboardingSteps[currentStep]
  const IconComponent = currentStepData.icon // Portal chevrons to body to avoid dialog positioning issues
  const ChevronNavigation = () => {
    if (!isOpen) return null

    return createPortal(
      <div className="fixed inset-0 pointer-events-none z-[60] flex items-center justify-center">
        <div className="relative max-w-2xl w-[95vw] sm:w-full flex items-center justify-between">
          {' '}
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
          </Button>{' '}
          {currentStep < onboardingSteps.length - 1 && (
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
              className="absolute right-[-60px] sm:right-[-80px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white/90 dark:bg-slate-900/90 rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0 pointer-events-auto shadow-lg backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
          )}
        </div>
      </div>,
      document.body
    )
  }
  return (
    <>
      <ChevronNavigation />
      <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
        <DialogContent
          className="max-w-2xl w-[95vw] sm:w-full h-[55vh] sm:h-[60vh] md:h-[65vh] max-h-[600px] min-h-[400px] p-0 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-0"
          onPointerDownOutside={e => {
            const target = e.target as Element
            if (target.closest('button[data-chevron]')) {
              e.preventDefault()
            }
          }}
        >
          <DialogTitle className="sr-only">
            {currentStepData.title}
          </DialogTitle>
          {' '}
          <div className="relative h-24 sm:h-32 overflow-hidden">
            <Image
              src={currentStepData.artworkImage}
              alt={`${currentStepData.title} artwork`}
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
                  {/* <div className={`p-2 rounded-lg bg-gradient-to-r ${currentStepData.gradient} shadow-md`}>
                <IconComponent className="w-5 h-5 text-white" />
              </div> */}
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                    {currentStepData.title}
                  </h2>
                </div>{' '}
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                  {currentStepData.description}
                </p>{' '}
                {currentStepData.isLastStep ? (
                  <>
                    <div className="mt-6 mb-3">
                      <Button
                        onClick={handleFinish}
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                      >
                        get started
                      </Button>
                    </div>
                  </>
                ) : currentStepData.examples ? (
                  <div className="space-y-2 mb-3">
                    <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                      try asking:
                    </h3>
                    <div className="space-y-2">
                      {currentStepData.examples.map((example, index) => (
                        <div
                          key={index}
                          className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg"
                        >
                          "{example}"
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex justify-center space-x-2 py-3 mt-2 border-t border-slate-100 dark:border-slate-800">
                {onboardingSteps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-300 hover:scale-110',
                      index === currentStep
                        ? `bg-gradient-to-r ${currentStepData.gradient} shadow-sm`
                        : 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500'
                    )}
                  />
                ))}
              </div>{' '}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
