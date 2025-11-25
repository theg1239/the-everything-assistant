'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Drawer } from 'vaul'
import { 
  FileText, 
  ArrowLeft, 
  Search, 
  Sparkles,
  BookOpen,
  Code,
  Database,
  Cpu,
  Network,
  Calculator,
  FlaskConical,
  ChevronRight,
  X,
  ArrowRight,
  LucideIcon
} from 'lucide-react'

// Popular courses to show with paper counts
const POPULAR_COURSES = [
  { code: 'BCSE202L', name: 'Data Structures and Algorithms', acronym: 'DSA', icon: Code },
  { code: 'BCSE302L', name: 'Database Systems', acronym: 'DBMS', icon: Database },
  { code: 'BCSE303L', name: 'Operating Systems', acronym: 'OS', icon: Cpu },
  { code: 'BCSE308L', name: 'Computer Networks', acronym: 'CN', icon: Network },
  { code: 'BCSE306L', name: 'Artificial Intelligence', acronym: 'AI', icon: Sparkles },
  { code: 'BCSE209L', name: 'Machine Learning', acronym: 'ML', icon: BookOpen },
  { code: 'BMAT101L', name: 'Calculus', acronym: 'CALC', icon: Calculator },
  { code: 'BPHY101L', name: 'Engineering Physics', acronym: 'PHY', icon: FlaskConical },
] as const

const QUICK_QUERIES = [
  'find DSA FAT papers',
  'DBMS CAT 1 papers',
  'operating systems quiz',
  'physics previous year',
  'download calculus FAT',
  'machine learning papers',
]

const FEATURES = [
  { title: 'FAT papers', description: 'final assessment test papers for all subjects' },
  { title: 'CAT papers', description: 'CAT 1 and CAT 2 papers with solutions' },
  { title: 'quiz papers', description: 'quiz and DA question papers' },
  { title: 'multiple sources', description: 'examcooker, paper vault, codechef, and more' },
]

const SOURCES = ['VIT Papers Archive', 'ExamCooker', 'VIT Paper Vault', 'CodeChef VIT']

interface PaperCount {
  code: string
  count: number
  loading: boolean
  error: boolean
}

interface PaperSearchResponse {
  success: boolean
  totalFound?: number
}

interface CourseData {
  code: string
  name: string
  acronym: string
  icon: LucideIcon
}

// Skeleton component for loading states
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/10 rounded ${className}`} />
  )
}

// Course card skeleton
function CourseCardSkeleton() {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="w-4 h-4 rounded" />
      </div>
      <Skeleton className="h-5 w-16 mb-1.5" />
      <Skeleton className="h-3 w-full mb-3" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

// Memoized Course card component - defined OUTSIDE the main component
interface CourseCardProps {
  course: CourseData
  index: number
  paperData: PaperCount | undefined
  onClick: () => void
}

const CourseCard = memo(function CourseCard({ course, index, paperData, onClick }: CourseCardProps) {
  const Icon = course.icon
  
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      onClick={onClick}
      className="group relative p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-green-500/30 rounded-2xl text-left transition-all duration-300 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 bg-green-500/10 rounded-xl group-hover:bg-green-500/15 transition-colors duration-300">
          <Icon className="w-4 h-4 text-green-400" />
        </div>
        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-green-400 group-hover:translate-x-0.5 transition-all duration-300" />
      </div>
      <div className="font-semibold text-white/90 group-hover:text-white transition-colors duration-300 text-base">
        {course.acronym}
      </div>
      <div className="text-xs text-white/40 truncate mb-3 leading-relaxed">
        {course.name}
      </div>
      <div className="text-xs font-medium">
        <AnimatePresence mode="wait">
          {paperData?.loading ? (
            <motion.span 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-white/30 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
              loading...
            </motion.span>
          ) : paperData?.error ? (
            <motion.span 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-white/30"
            >
              tap to search
            </motion.span>
          ) : (
            <motion.span 
              key="count"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-green-400"
            >
              {paperData?.count || 0} papers
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
})

// Memoized drawer course card
interface DrawerCourseCardProps {
  course: CourseData
  paperData: PaperCount | undefined
  onClick: () => void
}

const DrawerCourseCard = memo(function DrawerCourseCard({ course, paperData, onClick }: DrawerCourseCardProps) {
  const Icon = course.icon
  
  return (
    <button
      onClick={onClick}
      className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-left active:scale-[0.98] transition-transform"
    >
      <div className="p-2 bg-green-500/10 rounded-xl w-fit mb-2">
        <Icon className="w-4 h-4 text-green-400" />
      </div>
      <div className="font-semibold text-white/90 text-sm">
        {course.acronym}
      </div>
      <div className="text-xs text-white/40 truncate mb-2">
        {course.name}
      </div>
      <div className="text-xs font-medium">
        {paperData?.loading ? (
          <span className="text-white/30">loading...</span>
        ) : paperData?.error ? (
          <span className="text-white/30">tap to search</span>
        ) : (
          <span className="text-green-400">
            {paperData?.count || 0} papers
          </span>
        )}
      </div>
    </button>
  )
})

export function PastPapersClient() {
  const router = useRouter()
  const [paperCounts, setPaperCounts] = useState<Record<string, PaperCount>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  
  // Track if we've already fetched to prevent duplicate requests
  const hasFetched = useRef(false)

  // Fetch paper counts for popular courses - with batched state update
  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    
    const fetchPaperCounts = async () => {
      // Initialize with loading state
      const initialState: Record<string, PaperCount> = {}
      POPULAR_COURSES.forEach(course => {
        initialState[course.code] = { code: course.code, count: 0, loading: true, error: false }
      })
      setPaperCounts(initialState)

      // Small delay for smoother initial load
      await new Promise(resolve => setTimeout(resolve, 300))
      setInitialLoading(false)

      // Fetch all counts in parallel and batch the state update
      const results = await Promise.all(
        POPULAR_COURSES.map(async (course) => {
          try {
            const response = await fetch(`/api/public/papers/search?course=${course.code}`)
            const data = await response.json() as PaperSearchResponse
            return {
              code: course.code,
              count: data.success ? (data.totalFound ?? 0) : 0,
              loading: false,
              error: !data.success
            }
          } catch {
            return {
              code: course.code,
              count: 0,
              loading: false,
              error: true
            }
          }
        })
      )
      
      // Single state update with all results
      const finalState: Record<string, PaperCount> = {}
      results.forEach(result => {
        finalState[result.code] = result
      })
      setPaperCounts(finalState)
    }

    fetchPaperCounts()
  }, [])

  const handleCourseClick = useCallback((course: CourseData) => {
    router.push(`/features/past-papers/course/${course.code.toLowerCase()}`)
  }, [router])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    sessionStorage.setItem('prefilled-query', `find ${searchQuery} past papers`)
    router.push('/')
  }, [searchQuery, router])

  const handleQuickQuery = useCallback((query: string) => {
    sessionStorage.setItem('prefilled-query', query)
    router.push('/')
  }, [router])

  return (
    <div className="min-h-[100dvh] bg-black text-white relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-green-950/20 via-black to-black" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,197,94,0.15),transparent)]" />
      
      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 sm:pb-12">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          onClick={() => router.push('/features')}
          className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-8 sm:mb-10 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm">features</span>
        </motion.button>

        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-10 sm:mb-12"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-green-500/15 border border-green-500/20 mb-5 sm:mb-6">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-green-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight">
            past papers
          </h1>
          <p className="text-white/50 text-base sm:text-lg max-w-md mx-auto leading-relaxed px-4">
            search and download fat, cat, quiz papers for any course
          </p>
        </motion.div>

        {/* Search bar */}
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
          onSubmit={handleSearch}
          className="max-w-xl mx-auto mb-10 sm:mb-12 px-2"
        >
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-white/50 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="search any course..."
              className="w-full pl-12 pr-24 py-3.5 sm:py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.05] focus:border-green-500/30 transition-all duration-300 text-base"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/25 rounded-xl text-green-400 font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              search
            </button>
          </div>
        </motion.form>

        {/* Popular courses */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-10 sm:mb-12"
        >
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <h2 className="text-sm font-medium text-white/60 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-green-400" />
              popular courses
            </h2>
            {/* Mobile: View all button */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="sm:hidden text-xs text-green-400 hover:text-green-300 transition-colors flex items-center gap-1"
            >
              view all
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          {/* Desktop grid */}
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
            {initialLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <CourseCardSkeleton key={i} />
              ))
            ) : (
              POPULAR_COURSES.map((course, index) => (
                <CourseCard 
                  key={course.code} 
                  course={course} 
                  index={index}
                  paperData={paperCounts[course.code]}
                  onClick={() => handleCourseClick(course)}
                />
              ))
            )}
          </div>
          
          {/* Mobile: Horizontal scroll */}
          <div className="sm:hidden -mx-4 px-4">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
              {initialLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[160px] snap-start">
                    <CourseCardSkeleton />
                  </div>
                ))
              ) : (
                POPULAR_COURSES.slice(0, 4).map((course, index) => (
                  <div key={course.code} className="flex-shrink-0 w-[160px] snap-start">
                    <CourseCard 
                      course={course} 
                      index={index}
                      paperData={paperCounts[course.code]}
                      onClick={() => handleCourseClick(course)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>

        {/* Quick queries */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10 sm:mb-12"
        >
          <h2 className="text-sm font-medium text-white/60 mb-4">try asking</h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_QUERIES.map((query, index) => (
              <motion.button
                key={query}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.03 }}
                onClick={() => handleQuickQuery(query)}
                className="px-3 py-2 bg-white/[0.03] hover:bg-green-500/10 border border-white/[0.06] hover:border-green-500/25 rounded-xl text-sm text-white/60 hover:text-green-400 transition-all duration-300 active:scale-[0.97]"
              >
                &quot;{query}&quot;
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="grid grid-cols-2 gap-3 mb-10 sm:mb-12"
        >
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl"
            >
              <h3 className="font-medium text-white/80 mb-1 text-sm sm:text-base">{feature.title}</h3>
              <p className="text-xs sm:text-sm text-white/40 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </motion.div>

        {/* Sources */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mb-10 sm:mb-12"
        >
          <p className="text-xs text-white/30 mb-3">papers sourced from</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SOURCES.map((source) => (
              <span
                key={source}
                className="px-3 py-1.5 bg-white/[0.02] border border-white/[0.05] rounded-full text-xs text-white/50"
              >
                {source}
              </span>
            ))}
          </div>
        </motion.div>

        {/* CTA - Hidden on mobile (we have sticky button) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="hidden sm:block text-center"
        >
          <button
            onClick={() => {
              sessionStorage.setItem('prefilled-query', 'find past papers for my courses')
              router.push('/')
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-500/15 hover:bg-green-500/20 border border-green-500/25 rounded-2xl text-green-400 font-medium transition-all duration-300 group active:scale-[0.98]"
          >
            <Sparkles className="w-5 h-5" />
            start searching papers
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent pb-safe">
        <button
          onClick={() => {
            sessionStorage.setItem('prefilled-query', 'find past papers')
            router.push('/')
          }}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-green-500 hover:bg-green-400 rounded-2xl text-black font-semibold transition-all duration-300 active:scale-[0.98]"
        >
          <Search className="w-5 h-5" />
          search papers in chat
        </button>
      </div>

      {/* Mobile drawer for all courses */}
      <Drawer.Root open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 rounded-t-[20px] max-h-[85vh] outline-none">
            <div className="p-4 pb-8">
              {/* Handle */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white">all courses</h3>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 -mr-2 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Course grid */}
              <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[60vh] pb-4">
                {POPULAR_COURSES.map((course) => (
                  <DrawerCourseCard
                    key={course.code}
                    course={course}
                    paperData={paperCounts[course.code]}
                    onClick={() => {
                      handleCourseClick(course)
                      setMobileDrawerOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
