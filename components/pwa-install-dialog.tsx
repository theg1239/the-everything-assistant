'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export function PWAInstallDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const hasSeenPrompt = localStorage.getItem('seen-pwa-install-prompt')

    if (isIOS && !isStandalone && !hasSeenPrompt) {
      setIsOpen(true)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem('seen-pwa-install-prompt', 'true')
    setIsOpen(false)
  }

  if (!isMounted || !isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md w-[95vw] bg-white dark:bg-slate-900 flex flex-col p-0 rounded-2xl shadow-2xl overflow-hidden h-auto max-h-[90vh] sm:max-h-[80vh] border-0"
      >
        <DialogTitle className="sr-only">install app</DialogTitle>
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/20 hover:bg-black/30 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
        <div className="relative h-24 sm:h-32 overflow-hidden">
          <Image
            src="/onboarding-artwork/artwork.png"
            alt="Install App artwork"
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
                  install the everything assistant
                </h2>
              </div>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                to install this app on your iOS device, tap the share button and then find and tap 'add to home screen'.
              </p>
              <div className="mt-6 mb-3">
                <Button
                  onClick={handleClose}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                >
                  got it!
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
