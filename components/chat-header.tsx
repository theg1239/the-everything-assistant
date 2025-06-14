'use client'

import { motion } from 'framer-motion'
import { memo } from 'react'
import { useSession } from 'next-auth/react'

const PureChatHeader = () => {
  const { data: session } = useSession()

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="sticky top-0 z-50 w-full"
    >
      <div className="flex flex-col items-center justify-center h-[8.5rem] px-4">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-2">
          hey {session?.user?.name?.split(' ')[0]?.toLowerCase() || 'there'}!
        </h1>
        {/* <p className="text-sm text-muted-foreground text-center max-w-[40rem] leading-normal">
          comprehensive knowledge base for vit vellore - courses, exams, mess details...anything!
        </p> */}
      </div>
    </motion.div>
  )
}

export const ChatHeader = memo(PureChatHeader)
