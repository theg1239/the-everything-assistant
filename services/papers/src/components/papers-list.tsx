'use client'

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Download,
  Eye,
  Calendar,
  FileText,
  GraduationCap,
  Clock,
  Hash,
  Loader2,
  X,
  SlidersHorizontal,
  Star,
} from 'lucide-react'
import {
  searchPapers,
  getFilterOptions,
  type SearchFilters,
  type PaginationOptions,
} from '../actions/searchPapers'
import { formatFileSize, formatDate } from '../lib/utils'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'

interface Paper {
  id: string
  title: string
  courseCode?: string
  year?: number
  slot?: string
  semester?: string
  examType?: string
  fileUrl: string
  thumbnailUrl: string
  createdAt: Date
  originalFilename?: string
  fileSize?: number
  mimeType?: string
}

export interface PapersListRef {
  refreshPapers: () => void
}

const PapersList = forwardRef<PapersListRef>((props, ref) => {
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<SearchFilters>({})
  const [pagination, setPagination] = useState<PaginationOptions>({ page: 1, limit: 12 })
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState<any>({})
  const [showFilters, setShowFilters] = useState(false)

  const loadPapers = async () => {
    setLoading(true)
    try {
      const result = await searchPapers(filters, pagination)
      setPapers(result.papers)
      setTotalPages(result.totalPages)
    } catch (error) {
      console.error('Error loading papers:', error)
    } finally {
      setLoading(false)
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      refreshPapers: () => {
        loadPapers()
      },
    }),
    [filters, pagination]
  )

  const loadFilterOptions = async () => {
    try {
      const options = await getFilterOptions()
      setFilterOptions(options)
    } catch (error) {
      console.error('Error loading filter options:', error)
    }
  }

  useEffect(() => {
    loadPapers()
  }, [filters, pagination])

  useEffect(() => {
    loadFilterOptions()
  }, [])

  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const clearFilters = () => {
    setFilters({})
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '')
  const activeFilterCount = Object.values(filters).filter(
    value => value !== undefined && value !== ''
  ).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="space-y-8"
    >

      <div className="space-y-6">

        <div className="search-container">
          <div className="relative">
            <Search className="absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="search papers by title, content, or course code..."
              value={filters.query || ''}
              onChange={e => handleFilterChange('query', e.target.value)}
              className="border-0 bg-transparent pl-16 pr-6 py-6 text-lg placeholder:text-gray-500 focus:outline-none focus:ring-0"
            />
          </div>
        </div>


        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="rounded-2xl border-gray-200/60 bg-white/90 px-6 py-3 backdrop-blur-sm hover:bg-gray-50 dark:border-gray-800/60 dark:bg-gray-900/90 dark:hover:bg-gray-800/90"
            >
              <SlidersHorizontal className="h-5 w-5" />
              filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-6 w-6 rounded-full p-0 text-xs font-bold"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            <AnimatePresence>
              {hasActiveFilters && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="rounded-xl text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <X className="h-4 w-4" />
                    clear filters
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                loading...
              </div>
            ) : (
              <span className="font-medium">
                {papers.length} paper{papers.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>
        </div>


        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <Card className="border border-border bg-card">
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        key: 'courseCode',
                        label: 'course code',
                        options: filterOptions.courseCodes,
                        placeholder: 'all courses',
                      },
                      {
                        key: 'year',
                        label: 'year',
                        options: filterOptions.years,
                        placeholder: 'all years',
                      },
                      {
                        key: 'slot',
                        label: 'slot',
                        options: filterOptions.slots,
                        placeholder: 'all slots',
                      },
                      {
                        key: 'examType',
                        label: 'exam type',
                        options: filterOptions.examTypes,
                        placeholder: 'all types',
                      },
                    ].map((filter, index) => (
                      <motion.div
                        key={filter.key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                        className="space-y-3"
                      >
                        <Label className="text-sm font-semibold text-gray-900 dark:text-white">
                          {filter.label}
                        </Label>
                        <select
                          value={filters[filter.key as keyof SearchFilters] || ''}
                          onChange={e =>
                            handleFilterChange(filter.key as keyof SearchFilters, e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200/60 bg-white/90 px-4 py-3 text-sm backdrop-blur-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100/50 dark:border-gray-800/60 dark:bg-gray-900/90 dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
                        >
                          <option value="">{filter.placeholder}</option>
                          {filter.options?.map((option: string | number) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24"
          >
            <div className="rounded-3xl bg-blue-100 p-8 dark:bg-blue-900/30">
              <Loader2 className="h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <p className="mt-6 text-xl font-semibold text-gray-600 dark:text-gray-400">
              loading papers...
            </p>
          </motion.div>
        ) : papers.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="rounded-3xl bg-gray-100 p-8 dark:bg-gray-800">
              <FileText className="h-20 w-20 text-gray-400" />
            </div>
            <h3 className="mt-8 text-3xl font-bold text-gray-900 dark:text-white">
              no papers found
            </h3>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-md">
              {hasActiveFilters
                ? 'try adjusting your filters or search terms'
                : 'upload some papers to get started'}
            </p>
            {hasActiveFilters && (
              <Button
                onClick={clearFilters}
                className="mt-6 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3 font-semibold"
              >
                clear all filters
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="papers"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {papers.map((paper, index) => (
              <motion.div
                key={paper.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="modern-card group"
              >

                <div className="relative aspect-[3/4] overflow-hidden rounded-t-2xl bg-muted">
                  <img
                    src={paper.thumbnailUrl || '/placeholder.svg?height=400&width=300'}
                    alt={paper.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />


                  <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/10 group-hover:opacity-100">
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        className="rounded-full bg-white/95 text-gray-900 shadow-lg backdrop-blur-sm hover:bg-white"
                        asChild
                      >
                        <a href={paper.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-4 w-4" />
                        </a>
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        className="rounded-full bg-white/95 text-gray-900 shadow-lg backdrop-blur-sm hover:bg-white"
                        asChild
                      >
                        <a href={paper.fileUrl} download={paper.originalFilename}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </motion.div>
                  </div>


                  <div className="absolute right-4 top-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full bg-white/90 p-2 opacity-0 backdrop-blur-sm transition-all duration-300 hover:bg-white group-hover:opacity-100"
                    >
                      <Star className="h-4 w-4 text-gray-600" />
                    </Button>
                  </div>
                </div>


                <CardContent className="p-6 space-y-4">
                  <h3 className="line-clamp-2 text-lg font-bold leading-tight text-gray-900 dark:text-white min-h-[3.5rem]">
                    {paper.title}
                  </h3>


                  {paper.courseCode && (
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                        <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="font-mono font-bold text-blue-900 dark:text-blue-100">
                        {paper.courseCode}
                      </span>
                    </div>
                  )}


                  <div className="flex flex-wrap gap-2">
                    {paper.year && (
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        <Calendar className="mr-1 h-3 w-3" />
                        {paper.year}
                      </Badge>
                    )}
                    {paper.slot && (
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        <Hash className="mr-1 h-3 w-3" />
                        {paper.slot}
                      </Badge>
                    )}
                    {paper.examType && (
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      >
                        {paper.examType}
                      </Badge>
                    )}
                  </div>


                  <div className="flex items-center justify-between pt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(paper.createdAt)}
                    </div>
                    {paper.fileSize && (
                      <span className="font-mono">{formatFileSize(paper.fileSize)}</span>
                    )}
                  </div>
                </CardContent>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>


      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center pt-8"
        >
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="flex items-center gap-2 p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page! - 1)}
                disabled={pagination.page === 1}
                className="rounded-xl px-4 py-2"
              >
                previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = Math.max(1, Math.min(totalPages - 4, pagination.page! - 2)) + i
                  return (
                    <Button
                      key={page}
                      variant={page === pagination.page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                      className="rounded-xl w-10 h-10"
                    >
                      {page}
                    </Button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page! + 1)}
                disabled={pagination.page === totalPages}
                className="rounded-xl px-4 py-2"
              >
                next
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
})

PapersList.displayName = 'PapersList'

export default PapersList
