'use client'

import { motion } from 'framer-motion'
import { memo } from 'react'
import { SparklesIcon } from 'lucide-react'

const PureChatHeader = () => {
  return (    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="sticky top-0 z-50 w-full  backdrop-blur-xl"
    >
      <div className="flex flex-col items-center justify-center h-[8.5rem] px-4">
        <h1 className="text-2xl md:text-3xl font-light tracking-tight mb-2">
          vit assistant
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-[40rem] leading-normal">
          comprehensive knowledge base for vit vellore - courses, exams, faculty, placements,
          research, and everything you need to know
        </p>
      </div>
    </motion.div>
  )
}

export const ChatHeader = memo(PureChatHeader)
