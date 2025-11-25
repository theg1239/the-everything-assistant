'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { 
  FileText, 
  Search, 
  ArrowRight, 
  ArrowLeft,
  ExternalLink,
  Sparkles,
  FileDown,
  ChevronRight,
  X,
  Filter
} from 'lucide-react'

interface SubjectData {
  name: string
  fullName: string
  description: string
  relatedTopics: string[]
}

interface SubjectPageClientProps {
  subject: string
  data: SubjectData
}

interface Paper {
  title: string
  url: string
  exam_type?: string
  year?: string
  source?: string
}

interface PaperSearchResponse {
  success: boolean
  papers?: Paper[]
  totalFound?: number
  courseCode?: string
}

const SUBJECT_COURSE_MAP: Record<string, string> = {
  mathematics: 'BMAT101L',
  physics: 'BPHY101L',
  chemistry: 'BCHY101L',
  calculus: 'BMAT101L',
  'linear-algebra': 'BMAT201L',
  'probability-statistics': 'BMAT202L',
  'discrete-mathematics': 'BMAT205L',
  
  'computer-science': 'BCSE102L',
  'data-structures': 'BCSE202L',
  'database-systems': 'BCSE302L',
  'operating-systems': 'BCSE303L',
  'computer-networks': 'BCSE308L',
  'computer-architecture': 'BCSE205L',
  'theory-of-computation': 'BCSE304L',
  'compiler-design': 'BCSE307L',
  'software-engineering': 'BCSE301L',
  
  'machine-learning': 'BCSE209L',
  'artificial-intelligence': 'BCSE306L',
  'deep-learning': 'BCSE332L',
  'data-mining': 'BCSE208L',
  
  'digital-electronics': 'BECE102L',
  'microprocessors': 'BECE204L',
  'vlsi-design': 'BECE303L',
  'signals-systems': 'BECE301L',
  'embedded-systems': 'BCSE305L',
  
  'web-technologies': 'BITE304L',
  'information-security': 'BCSE317L',
  'cryptography': 'BCSE309L',
  
  'cloud-computing': 'BITE412L',
  'internet-of-things': 'BCSE401L',
  'big-data': 'BCSE402L',
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />
}

function PaperCardSkeleton() {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="w-4 h-4 rounded" />
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-3 w-3/4 mb-3" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-12 rounded" />
        <Skeleton className="h-5 w-16 rounded" />
      </div>
    </div>
  )
}

export default function SubjectPageClient({ subject, data }: SubjectPageClientProps) {
  const router = useRouter()
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [totalFound, setTotalFound] = useState(0)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [selectedExamType, setSelectedExamType] = useState<string | null>(null)

  useEffect(() => {
    const fetchPapers = async () => {
      const courseCode = SUBJECT_COURSE_MAP[subject]
      if (!courseCode) {
        setLoading(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      try {
        const response = await fetch(`/api/public/papers/search?course=${courseCode}`)
        const result = await response.json() as PaperSearchResponse
        
        if (result.success && result.papers) {
          setPapers(result.papers.slice(0, 15))
          setTotalFound(result.totalFound ?? 0)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchPapers()
  }, [subject])

  const handleQueryClick = useCallback((query: string) => {
    sessionStorage.setItem('prefilled-query', query)
    router.push('/')
  }, [router])

  const queries = [
    `find ${data.name.toLowerCase()} fat papers`,
    `${data.name.toLowerCase()} cat 1 papers`,
    `${data.name.toLowerCase()} cat 2 papers`,
    `${data.name.toLowerCase()} quiz papers`,
  ]

  const filteredPapers = selectedExamType 
    ? papers.filter(p => p.exam_type?.toLowerCase().includes(selectedExamType.toLowerCase()))
    : papers

  const examTypes = [...new Set(papers.map(p => p.exam_type).filter(Boolean))]

  return (
    <div className="min-h-screen min-h-[100dvh] bg-black text-white relative overflow-x-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-green-950/20 via-black to-black" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,197,94,0.12),transparent)]" />
      
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 sm:pb-12">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          onClick={() => router.push('/features/past-papers')}
          className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm">past papers</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-green-500/15 border border-green-500/20 mb-5">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-green-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">
            {data.name.toLowerCase()} papers
          </h1>
          <p className="text-white/50 text-base mb-3">{data.fullName}</p>
          <p className="text-white/30 text-sm max-w-md mx-auto">{data.description}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {data.relatedTopics.map(topic => (
            <span
              key={topic}
              className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-white/50"
            >
              {topic}
            </span>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white/60 flex items-center gap-2">
              <FileDown className="w-3.5 h-3.5 text-green-400" />
              available papers
              {!loading && totalFound > 0 && (
                <span className="text-white/40">({totalFound})</span>
              )}
            </h2>
            {papers.length > 0 && examTypes.length > 1 && (
              <button
                onClick={() => setFilterDrawerOpen(true)}
                className="sm:hidden flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedExamType || 'filter'}
              </button>
            )}
          </div>

          {papers.length > 0 && examTypes.length > 1 && (
            <div className="hidden sm:flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedExamType(null)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                  !selectedExamType 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                all
              </button>
              {examTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedExamType(type === selectedExamType ? null : type ?? null)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                    selectedExamType === type 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
          
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <PaperCardSkeleton key={i} />
              ))}
            </div>
          ) : error || papers.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
              <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 mb-4">
                {error ? 'could not load papers' : 'no papers found'}
              </p>
              <button
                onClick={() => handleQueryClick(`find ${data.name.toLowerCase()} past papers`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/15 hover:bg-green-500/20 border border-green-500/25 rounded-xl text-green-400 text-sm transition-all"
              >
                <Search className="w-4 h-4" />
                search in chat
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredPapers.map((paper, index) => (
                    <motion.a
                      key={`${paper.title}-${index}`}
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      className="group p-4 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] hover:border-green-500/25 rounded-2xl transition-all duration-300 active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <FileText className="w-4 h-4 text-green-400/70 flex-shrink-0 mt-0.5" />
                        <ExternalLink className="w-3 h-3 text-white/20 group-hover:text-green-400/70 transition-colors" />
                      </div>
                      <h3 className="text-sm font-medium text-white/80 group-hover:text-white/90 line-clamp-2 mb-2 leading-relaxed">
                        {paper.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {paper.exam_type && (
                          <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/15 rounded text-xs text-green-400/80">
                            {paper.exam_type}
                          </span>
                        )}
                        {paper.year && (
                          <span className="text-xs text-white/30">{paper.year}</span>
                        )}
                        {paper.source && (
                          <span className="text-xs text-white/20 truncate max-w-[80px]">{paper.source}</span>
                        )}
                      </div>
                    </motion.a>
                  ))}
                </AnimatePresence>
              </div>
              
              {totalFound > 15 && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => handleQueryClick(`find all ${data.name.toLowerCase()} past papers`)}
                    className="inline-flex items-center gap-1.5 text-sm text-green-400/80 hover:text-green-400 transition-colors"
                  >
                    view all {totalFound} papers
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-10"
        >
          <h2 className="text-sm font-medium text-white/60 mb-4">try asking</h2>
          <div className="flex flex-wrap gap-2">
            {queries.map((query, index) => (
              <motion.button
                key={query}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.03 }}
                onClick={() => handleQueryClick(query)}
                className="group flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-green-500/10 border border-white/[0.06] hover:border-green-500/25 rounded-xl text-sm text-white/60 hover:text-green-400 transition-all duration-300 active:scale-[0.97]"
              >
                <Search className="h-3 w-3" />
                &quot;{query}&quot;
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="hidden sm:block text-center"
        >
          <button
            onClick={() => handleQueryClick(`find ${data.name.toLowerCase()} past papers`)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-500/15 hover:bg-green-500/20 border border-green-500/25 rounded-2xl text-green-400 font-medium transition-all duration-300 group active:scale-[0.98]"
          >
            <Sparkles className="w-5 h-5" />
            search {data.name.toLowerCase()} papers
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>
      </div>

      <div className="sm:hidden fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent pb-safe">
        <button
          onClick={() => handleQueryClick(`find ${data.name.toLowerCase()} past papers`)}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-green-500 hover:bg-green-400 rounded-2xl text-black font-semibold transition-all duration-300 active:scale-[0.98]"
        >
          <Search className="w-5 h-5" />
          search {data.name.toLowerCase()} papers
        </button>
      </div>

      <Drawer.Root open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 rounded-t-[20px] outline-none">
            <div className="p-4 pb-8">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white">filter by type</h3>
                <button
                  onClick={() => setFilterDrawerOpen(false)}
                  className="p-2 -mr-2 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedExamType(null)
                    setFilterDrawerOpen(false)
                  }}
                  className={`w-full p-4 rounded-xl text-left transition-all ${
                    !selectedExamType 
                      ? 'bg-green-500/15 border border-green-500/30' 
                      : 'bg-white/[0.03] border border-white/[0.06]'
                  }`}
                >
                  <span className={selectedExamType ? 'text-white/70' : 'text-green-400'}>
                    all papers
                  </span>
                </button>
                {examTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedExamType(type ?? null)
                      setFilterDrawerOpen(false)
                    }}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      selectedExamType === type 
                        ? 'bg-green-500/15 border border-green-500/30' 
                        : 'bg-white/[0.03] border border-white/[0.06]'
                    }`}
                  >
                    <span className={selectedExamType === type ? 'text-green-400' : 'text-white/70'}>
                      {type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
