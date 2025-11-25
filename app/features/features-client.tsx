'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  GraduationCap,
  FileText,
  Calendar,
  UtensilsCrossed,
  BarChart3,
  Clock,
  BookOpen,
  Award,
  Search,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  Zap,
  MessageSquare,
} from 'lucide-react'
import { Drawer } from 'vaul'

const features = [
  {
    icon: GraduationCap,
    title: 'vtop integration',
    description: 'attendance, marks, grades, timetable - all from vtop',
    href: '/features/vtop',
    query: 'show my vtop dashboard',
    color: 'cyan',
    badge: 'popular',
  },
  {
    icon: FileText,
    title: 'past papers',
    description: 'fat, cat, quiz papers from multiple sources',
    href: '/features/past-papers',
    query: 'find past papers',
    color: 'green',
    badge: 'updated',
  },
  {
    icon: UtensilsCrossed,
    title: 'mess menu',
    description: "today's menu across all hostels",
    href: '/features/mess-menu',
    query: "what's for lunch today",
    color: 'orange',
  },
  {
    icon: BarChart3,
    title: 'attendance',
    description: '75% guardrails & bunk calculator',
    href: '/features/vtop/attendance',
    query: 'show my attendance',
    color: 'purple',
  },
  {
    icon: Award,
    title: 'grades & cgpa',
    description: 'semester grades and cgpa history',
    href: '/features/vtop/grades',
    query: 'show my grades',
    color: 'amber',
  },
  {
    icon: Clock,
    title: 'timetable',
    description: "today's classes and slot timings",
    href: '/features/vtop/timetable',
    query: 'show my timetable',
    color: 'indigo',
  },
  {
    icon: Calendar,
    title: 'calendar',
    description: 'exam dates, holidays, events',
    href: '/features/vtop/calendar',
    query: 'when is cat 1',
    color: 'rose',
  },
  {
    icon: BookOpen,
    title: 'study help',
    description: 'explain topics, solve problems',
    href: '/',
    query: 'help me understand binary search trees',
    color: 'teal',
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'group-hover:shadow-cyan-500/20' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', glow: 'group-hover:shadow-green-500/20' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', glow: 'group-hover:shadow-orange-500/20' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'group-hover:shadow-purple-500/20' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'group-hover:shadow-amber-500/20' },
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', glow: 'group-hover:shadow-indigo-500/20' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', glow: 'group-hover:shadow-rose-500/20' },
  teal: { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', glow: 'group-hover:shadow-teal-500/20' },
}

const quickQueries = [
  "what's my attendance",
  'find dsa fat papers',
  "what's for dinner",
  'show my timetable',
  'when is fat exam',
]

export default function FeaturesClient() {
  const router = useRouter()
  const [selectedFeature, setSelectedFeature] = useState<typeof features[0] | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleFeatureClick = (feature: typeof features[0]) => {
    // On mobile, show drawer with options
    if (window.innerWidth < 640) {
      setSelectedFeature(feature)
      setDrawerOpen(true)
    } else {
      // On desktop, go directly to chat with query
      sessionStorage.setItem('prefilled-query', feature.query)
      router.push('/')
    }
  }

  const handleTryNow = () => {
    if (selectedFeature) {
      sessionStorage.setItem('prefilled-query', selectedFeature.query)
      router.push('/')
    }
  }

  const handleLearnMore = () => {
    if (selectedFeature) {
      router.push(selectedFeature.href)
    }
  }

  const handleQuickQuery = (query: string) => {
    sessionStorage.setItem('prefilled-query', query)
    router.push('/')
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-900/50 via-black to-black" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent" />
      
      {/* Subtle grid pattern */}
      <div 
        className="fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px'
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-[100dvh] flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm">back</span>
            </button>
            <div className="flex items-center gap-1.5 text-white/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs font-medium tracking-wide">FEATURES</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 py-8 sm:py-12">
          <div className="max-w-6xl mx-auto">
            {/* Hero */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10 sm:mb-14"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-white/60">powerful tools for vit students</span>
              </motion.div>
              
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4"
              >
                everything you need
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="text-white/50 text-base sm:text-lg max-w-md mx-auto"
              >
                your vit companion — just ask and it happens
              </motion.p>
            </motion.div>

            {/* Quick queries - mobile only */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="sm:hidden mb-8 overflow-x-auto scrollbar-none -mx-4 px-4"
            >
              <div className="flex gap-2 w-max">
                {quickQueries.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleQuickQuery(query)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap"
                  >
                    <MessageSquare className="w-3 h-3" />
                    {query}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Features Grid */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            >
              {features.map((feature, index) => {
                const colors = colorMap[feature.color]
                const Icon = feature.icon
                
                return (
                  <motion.button
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.04, duration: 0.4 }}
                    onClick={() => handleFeatureClick(feature)}
                    className={`group relative flex flex-col p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 text-left ${colors.glow} hover:shadow-lg`}
                  >
                    {/* Badge */}
                    {feature.badge && (
                      <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        feature.badge === 'popular' 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                          : 'bg-green-500/20 text-green-400 border border-green-500/30'
                      }`}>
                        {feature.badge}
                      </div>
                    )}
                    
                    {/* Icon */}
                    <div className={`p-2.5 sm:p-3 rounded-xl ${colors.bg} border ${colors.border} w-fit mb-3 sm:mb-4 group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.text}`} />
                    </div>
                    
                    {/* Title */}
                    <h3 className="font-semibold text-sm sm:text-base text-white/90 group-hover:text-white transition-colors mb-1">
                      {feature.title}
                    </h3>
                    
                    {/* Description */}
                    <p className="text-xs sm:text-sm text-white/40 group-hover:text-white/50 transition-colors line-clamp-2 mb-3">
                      {feature.description}
                    </p>
                    
                    {/* Query hint - desktop only */}
                    <div className="hidden sm:flex items-center gap-1.5 mt-auto pt-2 border-t border-white/[0.04]">
                      <Search className="w-3 h-3 text-white/30" />
                      <span className="text-[11px] text-white/30 truncate group-hover:text-white/40 transition-colors">
                        "{feature.query}"
                      </span>
                    </div>
                    
                    {/* Mobile arrow */}
                    <div className="sm:hidden absolute bottom-4 right-4">
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </motion.button>
                )
              })}
            </motion.div>

            {/* CTA Section */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="mt-12 sm:mt-16 text-center"
            >
              <p className="text-white/40 text-sm mb-4 hidden sm:block">
                click any feature to start a conversation
              </p>
              <button
                onClick={() => {
                  sessionStorage.setItem('prefilled-query', 'help me with my studies')
                  router.push('/')
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full text-sm text-white/70 hover:text-white transition-all group"
              >
                <Sparkles className="w-4 h-4" />
                or just ask anything
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 px-4 border-t border-white/[0.04]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/30">
            <p>the everything assistant · built for vit students</p>
            <div className="flex items-center gap-4">
              <Link href="/" className="hover:text-white/50 transition-colors">chat</Link>
              <Link href="/login" className="hover:text-white/50 transition-colors">login</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Drawer */}
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none">
            <div className="bg-zinc-900 rounded-t-[20px] border-t border-white/10">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              
              {selectedFeature && (
                <div className="px-5 pb-8 pt-2">
                  {/* Feature header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`p-3 rounded-xl ${colorMap[selectedFeature.color].bg} border ${colorMap[selectedFeature.color].border}`}>
                      <selectedFeature.icon className={`w-6 h-6 ${colorMap[selectedFeature.color].text}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {selectedFeature.title}
                      </h3>
                      <p className="text-sm text-white/50">
                        {selectedFeature.description}
                      </p>
                    </div>
                  </div>
                  
                  {/* Query preview */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl mb-6">
                    <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                      <MessageSquare className="w-3 h-3" />
                      <span>example query</span>
                    </div>
                    <p className="text-sm text-white/70">"{selectedFeature.query}"</p>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleLearnMore}
                      className="flex-1 py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
                    >
                      learn more
                    </button>
                    <button
                      onClick={handleTryNow}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${colorMap[selectedFeature.color].bg} border ${colorMap[selectedFeature.color].border} ${colorMap[selectedFeature.color].text}`}
                    >
                      try now
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
