'use client'

import { motion } from 'framer-motion'
import { GraduationCap, Search, Upload, Zap, BookOpen, Filter, Sparkles } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

export function PapersHeader() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/30">

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 animate-float rounded-full bg-gradient-to-br from-blue-200/30 to-purple-200/30 blur-3xl dark:from-blue-800/20 dark:to-purple-800/20" />
        <div
          className="absolute -bottom-40 -left-40 h-80 w-80 animate-float rounded-full bg-gradient-to-tr from-green-200/30 to-blue-200/30 blur-3xl dark:from-green-800/20 dark:to-blue-800/20"
          style={{ animationDelay: '2s' }}
        />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 animate-pulse-slow -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-200/20 to-purple-200/20 blur-3xl dark:from-indigo-800/10 dark:to-purple-800/10" />
      </div>


      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(68,68,68,.03)_50%,transparent_75%,transparent_100%)] bg-[length:60px_60px] dark:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.02)_50%,transparent_75%,transparent_100%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:px-8">

        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >




          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-6"
          >
            <h1 className="mb-4 text-6xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-7xl">
              papers
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-lg font-medium text-gray-600 dark:text-gray-300 sm:text-xl"
            >
              exam papers, simplified
            </motion.p>
          </motion.div>



        </motion.div>
      </div>
    </div>
  )
}
