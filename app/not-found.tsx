'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import Aurora from '@/components/backgrounds/aurora'

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div className="absolute inset-0">
        <Aurora />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-2xl mx-auto"
        >
          <motion.div className="mb-8">
            <h1 className="text-8xl md:text-9xl font-black mb-4 tracking-wider text-white">404</h1>

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">page not found</h2>

            <p className="text-lg text-white/80 mb-8 leading-relaxed max-w-lg mx-auto">
              the page you're looking for has vanished into the void...
            </p>
            <div className="flex justify-center">
              <Button asChild variant="secondary" className="px-6">
                <Link href="/">go back home</Link>
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
    </div>
  )
}
