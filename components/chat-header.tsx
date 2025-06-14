'use client'

import { motion } from 'framer-motion'
import { memo } from 'react'
import { SparklesIcon } from 'lucide-react'

const PureChatHeader = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="text-center py-6 md:py-8 mt-4 md:mt-0 chat-page-header"
    >
      <div className="flex items-center justify-center mb-3 md:mb-4">
        <h1 className="text-2xl md:text-4xl font-light text-foreground tracking-wide">vit assistant</h1>
      </div>
      <p className="text-muted-foreground text-sm md:text-lg max-w-2xl mx-auto leading-relaxed px-4">
        comprehensive knowledge base for vit vellore - courses, exams, faculty, placements,
        research, and everything you need to know
      </p>
    </motion.div>
  )
}

export const ChatHeader = memo(PureChatHeader)
