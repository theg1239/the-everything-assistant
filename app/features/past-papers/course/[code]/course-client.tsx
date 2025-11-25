'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  FileText,
  Search,
  Download,
  ExternalLink,
  Sparkles,
  Calendar,
  BookOpen,
  Clock,
  ChevronRight,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'

interface Paper {
  title: string
  link: string
  source: string
  snippet?: string
  examType?: string
  year?: string
}

interface CourseClientProps {
  courseCode: string
  courseName: string
}

// Parse exam type from title/snippet
function parseExamType(title: string, snippet?: string): string {
  const text = `${title} ${snippet || ''}`.toLowerCase()
  if (text.includes('fat') || text.includes('final')) return 'FAT'
  if (text.includes('cat2') || text.includes('cat 2') || text.includes('cat-2')) return 'CAT 2'
  if (text.includes('cat1') || text.includes('cat 1') || text.includes('cat-1')) return 'CAT 1'
  if (text.includes('cat')) return 'CAT'
  if (text.includes('quiz')) return 'Quiz'
  if (text.includes('mid')) return 'Mid-term'
  return 'Exam'
}

// Parse year from title/snippet
function parseYear(title: string, snippet?: string): string | undefined {
  const text = `${title} ${snippet || ''}`
  const match = text.match(/20\d{2}/)
  return match ? match[0] : undefined
}

export default function CourseClient({ courseCode, courseName }: CourseClientProps) {
  const router = useRouter()
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPapers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/public/papers/search?q=${encodeURIComponent(courseCode)}&limit=20`
      )
      if (!response.ok) throw new Error('Failed to fetch papers')
      const data = (await response.json()) as { papers?: Paper[] }

      const enrichedPapers = (data.papers || []).map((p: Paper) => ({
        ...p,
        examType: parseExamType(p.title, p.snippet),
        year: parseYear(p.title, p.snippet),
      }))

      setPapers(enrichedPapers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load papers')
    } finally {
      setLoading(false)
    }
  }, [courseCode])

  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  const handleAskAssistant = () => {
    sessionStorage.setItem(
      'prefilled-query',
      `Find ${courseCode} ${courseName} past papers and help me prepare for the exam`
    )
    router.push('/chat')
  }

  // Group papers by exam type
  const groupedPapers = papers.reduce(
    (acc, paper) => {
      const type = paper.examType || 'Other'
      if (!acc[type]) acc[type] = []
      acc[type].push(paper)
      return acc
    },
    {} as Record<string, Paper[]>
  )

  const examTypeOrder = ['FAT', 'CAT 2', 'CAT 1', 'CAT', 'Quiz', 'Mid-term', 'Exam', 'Other']
  const sortedTypes = Object.keys(groupedPapers).sort(
    (a, b) => examTypeOrder.indexOf(a) - examTypeOrder.indexOf(b)
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Grid background */}
      <div className="pointer-events-none fixed inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb & Back */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-2 text-sm text-zinc-500"
        >
          <Link
            href="/features/past-papers"
            className="flex items-center gap-1 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Past Papers
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-zinc-400">{courseCode}</span>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-white/10">
              <BookOpen className="h-7 w-7 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="mb-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {courseCode}
              </h1>
              <p className="text-lg text-zinc-400">{courseName}</p>
            </div>
          </div>

          {/* Stats bar */}
          {!loading && papers.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full bg-zinc-800/50 px-4 py-2 text-sm ring-1 ring-white/5">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span className="text-zinc-300">
                  {papers.length} paper{papers.length !== 1 ? 's' : ''} found
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-zinc-800/50 px-4 py-2 text-sm ring-1 ring-white/5">
                <Calendar className="h-4 w-4 text-amber-400" />
                <span className="text-zinc-300">{sortedTypes.length} exam types</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Ask Assistant CTA */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={handleAskAssistant}
          className="group mb-10 flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 p-5 ring-1 ring-white/10 transition-all hover:ring-violet-500/30"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-white">Need help preparing?</p>
            <p className="text-sm text-zinc-400">
              Ask the AI assistant for study tips, explanations, and more
            </p>
          </div>
          <MessageSquare className="h-5 w-5 text-zinc-500 transition-colors group-hover:text-violet-400" />
        </motion.button>

        {/* Loading State */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl bg-zinc-800/30 p-6 ring-1 ring-white/5"
                >
                  <div className="mb-3 h-5 w-32 rounded bg-zinc-700/50" />
                  <div className="space-y-3">
                    <div className="h-16 w-full rounded-xl bg-zinc-700/30" />
                    <div className="h-16 w-full rounded-xl bg-zinc-700/30" />
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-red-500/10 p-6 ring-1 ring-red-500/20"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <p className="text-red-300">{error}</p>
            </div>
            <button
              onClick={fetchPapers}
              className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/30"
            >
              Try again
            </button>
          </motion.div>
        )}

        {/* No Results */}
        {!loading && !error && papers.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-zinc-800/30 p-10 text-center ring-1 ring-white/5"
          >
            <Search className="mx-auto mb-4 h-12 w-12 text-zinc-600" />
            <h3 className="mb-2 text-lg font-medium text-white">No papers found</h3>
            <p className="mb-6 text-zinc-400">
              We couldn&apos;t find any past papers for {courseCode}. Try asking the AI assistant
              for help.
            </p>
            <button
              onClick={handleAskAssistant}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-violet-500"
            >
              <Sparkles className="h-4 w-4" />
              Ask Assistant
            </button>
          </motion.div>
        )}

        {/* Papers List */}
        {!loading && !error && papers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {sortedTypes.map((examType, typeIndex) => (
              <motion.div
                key={examType}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + typeIndex * 0.1 }}
                className="overflow-hidden rounded-2xl bg-zinc-800/30 ring-1 ring-white/5"
              >
                {/* Section Header */}
                <div className="flex items-center gap-3 border-b border-white/5 bg-zinc-800/50 px-5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      examType === 'FAT'
                        ? 'bg-red-500/20 text-red-300'
                        : examType.includes('CAT')
                          ? 'bg-amber-500/20 text-amber-300'
                          : examType === 'Quiz'
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-zinc-500/20 text-zinc-300'
                    }`}
                  >
                    {examType}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {groupedPapers[examType].length} paper
                    {groupedPapers[examType].length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Papers */}
                <div className="divide-y divide-white/5">
                  {groupedPapers[examType].map((paper, idx) => (
                    <a
                      key={idx}
                      href={paper.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-4 p-4 transition-colors hover:bg-white/5"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-700/50 transition-colors group-hover:bg-zinc-700">
                        <FileText className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="mb-1 line-clamp-2 text-sm font-medium text-white transition-colors group-hover:text-blue-400">
                          {paper.title}
                        </h4>
                        {paper.snippet && (
                          <p className="mb-2 line-clamp-2 text-xs text-zinc-500">{paper.snippet}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          {paper.year && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {paper.year}
                            </span>
                          )}
                          <span className="truncate">{paper.source}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-700/50 opacity-0 transition-all group-hover:opacity-100">
                          {paper.link.toLowerCase().includes('.pdf') ? (
                            <Download className="h-4 w-4 text-zinc-300" />
                          ) : (
                            <ExternalLink className="h-4 w-4 text-zinc-300" />
                          )}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center text-sm text-zinc-600"
        >
          Papers are sourced from public educational resources. <br />
          <Link href="/features/past-papers" className="text-zinc-500 hover:text-white">
            Browse all courses →
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
