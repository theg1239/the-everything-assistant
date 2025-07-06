'use client'

import { motion } from 'framer-motion'
import { GraduationCap, Search, Upload, Zap, BookOpen, Filter, Sparkles } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

export function PapersHeader() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/30">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 animate-float rounded-full bg-gradient-to-br from-blue-200/30 to-purple-200/30 blur-3xl dark:from-blue-800/20 dark:to-purple-800/20" />
        <div
          className="absolute -bottom-40 -left-40 h-80 w-80 animate-float rounded-full bg-gradient-to-tr from-green-200/30 to-blue-200/30 blur-3xl dark:from-green-800/20 dark:to-blue-800/20"
          style={{ animationDelay: '2s' }}
        />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 animate-pulse-slow -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-200/20 to-purple-200/20 blur-3xl dark:from-indigo-800/10 dark:to-purple-800/10" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(68,68,68,.03)_50%,transparent_75%,transparent_100%)] bg-[length:60px_60px] dark:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.02)_50%,transparent_75%,transparent_100%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:px-8">
        {/* Theme toggle */}
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* Logo/Icon */}
          {/* <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 shadow-2xl shadow-blue-500/25"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-20 blur-xl"
            />
          </motion.div> */}

          {/* Main heading */}
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

          {/* Feature highlights */}
          {/* <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-wrap justify-center gap-4"
          >
            {[
              { icon: Upload, text: "Smart Upload", color: "from-green-500 to-emerald-600" },
              { icon: Search, text: "AI Search", color: "from-blue-500 to-cyan-600" },
              { icon: Filter, text: "Smart Filters", color: "from-purple-500 to-violet-600" },
              { icon: BookOpen, text: "OCR Magic", color: "from-orange-500 to-red-600" },
              { icon: Zap, text: "Lightning Fast", color: "from-yellow-500 to-amber-600" },
            ].map((feature, index) => (
              <motion.div
                key={feature.text}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 + index * 0.1 }}
                whileHover={{ scale: 1.05, y: -2 }}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-r ${feature.color} p-4 shadow-lg transition-all duration-300 hover:shadow-xl`}
              >
                <div className="flex items-center gap-3 text-white">
                  <feature.icon className="h-5 w-5" />
                  <span className="font-medium">{feature.text}</span>
                </div>
                <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </motion.div>
            ))}
          </motion.div> */}
        </motion.div>
      </div>
    </div>
  )
}
