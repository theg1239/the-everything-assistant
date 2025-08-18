'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/server/vtop-credentials'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { VTOPCredentialsDialog } from '@/components/vtop/credentials-dialog'

const VTOP_COMMANDS = [
  {
    id: 'attendance',
    label: 'attendance',
    category: 'academic',
    requiresCreds: true,
    description: 'view class attendance records',
  },
  {
    id: 'timetable',
    label: 'timetable',
    category: 'academic',
    requiresCreds: true,
    description: 'current semester schedule',
  },
  {
    id: 'marks',
    label: 'marks',
    category: 'academic',
    requiresCreds: true,
    description: 'exam and assignment marks',
  },
  {
    id: 'grades',
    label: 'grades',
    category: 'academic',
    requiresCreds: true,
    description: 'final course grades',
  },
  {
    id: 'cgpa',
    label: 'cgpa',
    category: 'academic',
    requiresCreds: true,
    description: 'cumulative grade point average',
  },
  {
    id: 'exams',
    label: 'exams',
    category: 'academic',
    requiresCreds: true,
    description: 'exam timetable and details',
  },
  // { id: 'syllabus', label: 'syllabus', category: 'academic', requiresCreds: true, description: 'course curriculum and topics' },
  {
    id: 'course-page',
    label: 'course page',
    category: 'academic',
    requiresCreds: true,
    description: 'search course materials and info',
  },
  {
    id: 'receipts',
    label: 'fee receipts',
    category: 'finance',
    requiresCreds: true,
    description: 'payment history and receipts',
  },
  {
    id: 'hostel',
    label: 'hostel info',
    category: 'services',
    requiresCreds: true,
    description: 'hostel details',
  },
  {
    id: 'library-dues',
    label: 'library dues',
    category: 'services',
    requiresCreds: true,
    description: 'outstanding library dues',
  },
  {
    id: 'nightslip',
    label: 'night slip',
    category: 'services',
    requiresCreds: true,
    description: 'hostel night out permissions',
  },
  {
    id: 'leave-status',
    label: 'leave status',
    category: 'services',
    requiresCreds: true,
    description: 'track leave requests',
  },
  {
    id: 'class-message',
    label: 'class messages',
    category: 'communication',
    requiresCreds: true,
    description: 'class messages',
  },
  {
    id: 'da',
    label: 'digital assignments',
    category: 'academic',
    requiresCreds: true,
    description: 'assignment deadlines',
  },
  {
    id: 'facility',
    label: 'facilities',
    category: 'services',
    requiresCreds: true,
    description: 'campus facility bookings',
  },
]

const CATEGORIES = {
  all: { label: 'all', accent: 'accent-slate-500' },
  academic: { label: 'academic', accent: 'accent-blue-500' },
  finance: { label: 'finance', accent: 'accent-emerald-500' },
  services: { label: 'services', accent: 'accent-violet-500' },
}

const LoadingSkeleton = () => (
  <div className="h-full w-full p-6 animate-pulse">
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-3 h-3 bg-emerald-500/50 rounded-full animate-pulse" />
        <div className="h-4 bg-muted/40 rounded w-48" />
      </div>

      <div className="space-y-4">
        <div className="h-6 bg-muted/40 rounded w-3/4" />
        <div className="h-4 bg-muted/30 rounded w-full" />
        <div className="h-4 bg-muted/30 rounded w-5/6" />
        <div className="h-4 bg-muted/20 rounded w-4/5" />

        <div className="mt-8 space-y-3">
          <div className="h-4 bg-muted/30 rounded w-2/3" />
          <div className="h-4 bg-muted/20 rounded w-full" />
          <div className="h-4 bg-muted/30 rounded w-3/4" />
          <div className="h-4 bg-muted/20 rounded w-5/6" />
          <div className="h-4 bg-muted/30 rounded w-1/2" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="h-3 bg-muted/40 rounded w-full" />
            <div className="h-3 bg-muted/30 rounded w-2/3" />
            <div className="h-3 bg-muted/20 rounded w-4/5" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-muted/30 rounded w-3/4" />
            <div className="h-3 bg-muted/20 rounded w-full" />
            <div className="h-3 bg-muted/40 rounded w-1/2" />
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <div className="h-4 bg-muted/20 rounded w-full" />
          <div className="h-4 bg-muted/30 rounded w-4/5" />
          <div className="h-4 bg-muted/20 rounded w-3/5" />
          <div className="h-4 bg-muted/40 rounded w-2/3" />
          <div className="h-4 bg-muted/20 rounded w-5/6" />
          <div className="h-4 bg-muted/30 rounded w-1/3" />
        </div>
      </div>
    </div>
  </div>
)

export default function VTOPPanel() {
  const {
    object,
    submit,
    isLoading,
    stop,
    error: objectError,
  } = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
  const [command, setCommand] = useState<string>('')
  const [username, setUsername] = useState('')
  const [encryptedPassword, setEncryptedPassword] = useState('')
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [showCreds, setShowCreds] = useState(false)
  const [linked, setLinked] = useState<boolean>(hasVTOPCredentials())
  const [localError, setLocalError] = useState<string | null>(null)
  const [display, setDisplay] = useState<any>(null)
  const [cache, setCache] = useState<Record<string, any>>({})
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileView, setMobileView] = useState<'select' | 'result'>('select')
  const mobileOptionsRef = useRef<HTMLDivElement | null>(null)

  const commandHasOptions = (id?: string) =>
    id === 'marks' || id === 'grades' || id === 'syllabus' || id === 'course-page'

  const filteredCommands = useMemo(() => {
    let filtered = VTOP_COMMANDS

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(cmd => cmd.category === selectedCategory)
    }

    if (searchTerm) {
      filtered = filtered.filter(
        cmd =>
          cmd.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cmd.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cmd.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    return filtered
  }, [selectedCategory, searchTerm])

  const canRun = useMemo(() => {
    if (!command || isLoading) return false
    return Boolean(VTOP_COMMANDS.find(cmd => cmd.id === command))
  }, [command, isLoading])

  const runQuery = async (nextId?: string) => {
    const cmdId = nextId || command
    const selected = VTOP_COMMANDS.find(c => c.id === cmdId)
    if (selected?.requiresCreds && !linked) {
      setShowCreds(true)
      return
    }
    const extras: any = {}
    if (extra.semester) {
      const n = Number(extra.semester)
      if (!Number.isNaN(n)) extras.semester = n
    }

    if (cmdId === 'course-page') {
      if (extra.courseQuery) extras.courseQuery = extra.courseQuery
      if (extra.facultyQuery) extras.facultyQuery = extra.facultyQuery
      if (extra.materialQuery) extras.materialQuery = extra.materialQuery
    } else if (cmdId === 'syllabus') {
      if (extra.courseQuery) extras.courseQuery = extra.courseQuery
    } else if (cmdId === 'marks' || cmdId === 'grades') {
      // already passed semester/semesterQuery if present
    }
    setLocalError(null)
    setMobileView('result')
    try {
      setDisplay(null)
      if (nextId) setCommand(nextId)
      await submit({ command: cmdId, extras })
    } catch (e: any) {
      setLocalError(e?.message || 'request failed')
    }
  }

  useEffect(() => {
    if (objectError) setLocalError(objectError?.message || String(objectError))
  }, [objectError])

  useEffect(() => {
    if (object && command) {
      setDisplay(object)
      setCache(prev => ({ ...prev, [command]: object }))
    }
  }, [object])

  useEffect(() => {
    if (command) {
      setDisplay(cache[command] ?? null)
    } else {
      setDisplay(null)
    }
  }, [command])

  const selectedCommand = VTOP_COMMANDS.find(cmd => cmd.id === command)

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <div className="hidden lg:flex h-full">
        <div className="w-80 h-full border-r border-border/40 bg-card/40 backdrop-blur-sm flex flex-col">
          <div className="flex-shrink-0 border-b border-border/30 bg-card/60 backdrop-blur-sm">
            {/* <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">vtop</h1>
                <p className="text-xs text-muted-foreground mt-0.5">student portal interface</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${linked ? 'bg-emerald-500' : 'bg-amber-500'} shadow-sm`} />
                <span className="text-xs text-muted-foreground font-medium">{linked ? 'linked' : 'auth needed'}</span>
              </div>
            </div> */}

            {!linked && (
              <Button
                onClick={() => setShowCreds(true)}
                className="w-full h-7 text-xs bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-all duration-200 shadow-sm"
              >
                link credentials
              </Button>
            )}
          </div>

          <div className="flex-shrink-0 p-3 space-y-2 border-b border-border/20 bg-card/30">
            <Input
              placeholder="search services..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-7 text-xs bg-background/60 border border-border/40 focus:border-border focus:ring-1 focus:ring-primary/20 transition-all duration-200"
            />

            <div className="flex flex-wrap gap-1">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`
                    px-2 py-1 text-xs rounded-full transition-all duration-200 border shadow-sm
                    ${
                      selectedCategory === key
                        ? 'bg-primary text-primary-foreground border-transparent shadow-md'
                        : 'bg-background/60 text-foreground/80 border-border/40 hover:bg-background/80 hover:border-border/60'
                    }
                  `}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
            <div className="space-y-1 pt-2">
              {filteredCommands.map((cmd, index) => {
                const isSelected = command === cmd.id
                const isDisabled = cmd.requiresCreds && !linked

                return (
                  <button
                    key={cmd.id}
                    onClick={() => !isDisabled && setCommand(cmd.id)}
                    onDoubleClick={() => {
                      if (!isDisabled) runQuery(cmd.id)
                    }}
                    disabled={isDisabled}
                    className={`group w-full p-2.5 text-left rounded-lg transition-all duration-200 border shadow-sm
                      ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-transparent shadow-md'
                          : isDisabled
                            ? 'bg-muted/30 text-muted-foreground border-border/30 cursor-not-allowed opacity-60'
                            : 'bg-card/60 text-foreground border-border/40 hover:bg-card/80 hover:border-border/60 hover:shadow-md'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1 group-hover:translate-x-0.5 transition-transform duration-200">
                          {cmd.label}
                        </div>
                        <div className="text-xs opacity-70 line-clamp-2 transition-opacity duration-200">
                          {cmd.description}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2">
                        {cmd.requiresCreds && (
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-400'} transition-colors duration-300 shadow-sm`}
                          />
                        )}
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col min-w-0">
          <div className="flex-shrink-0 p-4 border-b border-border/30 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">
                  {selectedCommand ? selectedCommand.label : 'select a service'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {selectedCommand
                    ? selectedCommand.description
                    : 'choose from the services on the left to get started'}
                </p>
              </div>

              {command && (
                <div className="flex items-center gap-3 ml-4">
                  {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      processing
                    </div>
                  )}
                  <div className="flex gap-2">
                    {isLoading && (
                      <Button
                        variant="outline"
                        onClick={stop}
                        className="h-7 px-3 text-xs border-border/50 hover:border-border shadow-sm"
                      >
                        stop
                      </Button>
                    )}
                    <Button
                      onClick={() => runQuery()}
                      disabled={!canRun}
                      className="h-7 px-4 text-xs shadow-sm"
                    >
                      {isLoading ? 'running...' : 'execute'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {localError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200/60 rounded text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400 shadow-sm">
                {localError}
              </div>
            )}

            {command && (
              <div className="mt-3 space-y-2">
                {(command === 'marks' || command === 'grades') && (
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground w-24">semester</div>
                    <Select
                      value={extra.semester || (undefined as any)}
                      onValueChange={v => setExtra(prev => ({ ...prev, semester: v }))}
                    >
                      <SelectTrigger className="h-7 px-2 text-xs bg-background/70 border-border/50 w-44">
                        <SelectValue placeholder="choose semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => (
                          <SelectItem key={n} value={n}>
                            Semester {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {command === 'syllabus' && (
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground w-24">course</div>
                    <Input
                      value={extra.courseQuery || ''}
                      onChange={e => setExtra(prev => ({ ...prev, courseQuery: e.target.value }))}
                      placeholder="e.g., fluid mechanics"
                      className="h-7 text-xs bg-background/70 border-border/50 focus:border-border shadow-sm flex-1"
                    />
                  </div>
                )}

                {command === 'course-page' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-24">course</div>
                      <Input
                        value={extra.courseQuery || ''}
                        onChange={e => setExtra(prev => ({ ...prev, courseQuery: e.target.value }))}
                        placeholder="e.g., data structures"
                        className="h-7 text-xs bg-background/70 border-border/50 focus:border-border shadow-sm flex-1"
                      />
                    </div>
                    {/* <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-24">materials</div>
                      <Input
                        value={extra.materialQuery || ''}
                        onChange={e => setExtra(prev => ({ ...prev, materialQuery: e.target.value }))}
                        placeholder="e.g., week 5 notes, assignments"
                        className="h-7 text-xs bg-background/70 border-border/50 focus:border-border shadow-sm flex-1"
                      />
                    </div> */}
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-24">faculty</div>
                      <Input
                        value={extra.facultyQuery || ''}
                        onChange={e =>
                          setExtra(prev => ({ ...prev, facultyQuery: e.target.value }))
                        }
                        placeholder="optional"
                        className="h-7 text-xs bg-background/70 border-border/50 focus:border-border shadow-sm flex-1"
                      />
                    </div>
                    {/* <div className="flex items-center gap-2 pl-24 -mt-1">
                      {['notes','assignments','announcements','week 1','week 2','week 5','all'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setExtra(prev => ({ ...prev, materialQuery: (prev.materialQuery ? `${prev.materialQuery}, ` : '') + tag }))}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div> */}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 p-4 overflow-hidden min-h-0">
            <div className="h-full bg-card/40 rounded-lg border border-border/30 overflow-hidden backdrop-blur-sm shadow-sm">
              {!command && !display && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto border border-border/30">
                      <div className="w-6 h-6 border-2 border-muted-foreground/40 rounded-full border-dashed animate-spin" />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      waiting for service selection
                    </div>
                  </div>
                </div>
              )}

              {command && !display && !isLoading && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mx-auto text-primary-foreground text-sm font-medium border border-primary/20 shadow-sm">
                      {selectedCommand?.label.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ready to execute {selectedCommand?.label}
                    </div>
                  </div>
                </div>
              )}

              {!display && isLoading && <LoadingSkeleton />}

              {display && (
                <div
                  className="h-full overflow-y-auto p-4 animate-in fade-in duration-500"
                  key={display.command}
                >
                  {display.formatted_content ? (
                    <div
                      className="prose prose-slate dark:prose-invert max-w-none prose-sm"
                      dangerouslySetInnerHTML={{ __html: display.formatted_content }}
                    />
                  ) : display.summary ? (
                    <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {display.summary}
                    </div>
                  ) : (
                    <pre className="text-xs bg-muted/30 p-4 rounded border border-border/20 overflow-auto text-foreground font-mono shadow-sm">
                      {JSON.stringify(display, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden h-full flex flex-col bg-background">
        <div className="flex-shrink-0 p-4 bg-card/50 backdrop-blur-sm border-b border-border/40 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground">vtop</h1>
              <div
                className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-500'} shadow-sm`}
              />
            </div>
            <div className="flex items-center gap-2">
              {command && (
                <Button
                  onClick={() => {
                    if (mobileView === 'select') {
                      runQuery()
                    } else {
                      setMobileView('select')
                    }
                  }}
                  variant={mobileView === 'select' ? 'default' : 'outline'}
                  disabled={mobileView === 'select' && !canRun}
                  className="h-8 px-3 text-xs border-border/50 shadow-sm"
                >
                  {mobileView === 'select' ? 'execute' : 'select service'}
                </Button>
              )}
              {!linked && (
                <Button
                  onClick={() => setShowCreds(true)}
                  className="h-8 px-3 text-xs bg-primary hover:bg-primary/90 shadow-sm"
                >
                  link
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          {mobileView === 'select' && (
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 p-4 space-y-3 bg-card/30 border-b border-border/20">
                <Input
                  placeholder="search services..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-8 text-sm border-border/50 shadow-sm"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className={`
                        flex-shrink-0 px-3 py-1.5 text-xs rounded-full transition-all duration-200 border shadow-sm
                        ${
                          selectedCategory === key
                            ? 'bg-primary text-primary-foreground border-transparent'
                            : 'bg-card/70 text-foreground border-border/40 hover:bg-card/90'
                        }
                      `}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="space-y-2">
                  {filteredCommands.map(cmd => {
                    const isSelected = command === cmd.id
                    const isDisabled = cmd.requiresCreds && !linked

                    return (
                      <button
                        key={cmd.id}
                    onClick={() => {
                      if (!isDisabled) {
                        setCommand(cmd.id)
                        if (cache[cmd.id]) setMobileView('result')
                        // On mobile, when a cmd with options is selected, reveal options without manual scrolling
                        if (commandHasOptions(cmd.id)) {
                          // wait for render
                          setTimeout(() => {
                            mobileOptionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          }, 0)
                        }
                      }
                    }}
                        onDoubleClick={() => {
                          if (!isDisabled) {
                            runQuery(cmd.id)
                          }
                        }}
                        onTouchEnd={e => {
                          if (isDisabled) return
                          const el = e.currentTarget as HTMLElement
                          const last = (el as any)._lastTap || 0
                          const now = Date.now()
                          ;(el as any)._lastTap = now
                          if (now - last < 300) {
                            e.preventDefault()
                            runQuery(cmd.id)
                          }
                        }}
                        disabled={isDisabled}
                        className={`w-full p-4 text-left rounded-lg transition-all duration-200 border shadow-sm
                          ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-transparent shadow-md'
                              : isDisabled
                                ? 'bg-muted/30 text-muted-foreground border-border/30 cursor-not-allowed opacity-60'
                                : 'bg-card/70 text-foreground border-border/40 hover:bg-card/90 hover:shadow-md'
                          }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">{cmd.label}</div>
                            <div className="text-xs opacity-70 line-clamp-2">{cmd.description}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-3">
                            {cmd.requiresCreds && (
                              <div
                                className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-400'} shadow-sm`}
                              />
                            )}
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {command && (
                <div
                  ref={mobileOptionsRef}
                  className="flex-shrink-0 p-4 bg-card/50 backdrop-blur-sm border-t border-border/40 shadow-sm"
                >
                  <div className="space-y-3">
                    {/* parameter controls (mobile) */}
                    <div className="grid grid-cols-2 gap-2">
                      {(command === 'marks' || command === 'grades') && (
                        <Input
                          value={extra.semester || ''}
                          onChange={e => setExtra(prev => ({ ...prev, semester: e.target.value }))}
                          placeholder="semester (1-10)"
                          className="h-8 text-xs border-border/50 shadow-sm"
                          inputMode="numeric"
                        />
                      )}
                      {command === 'syllabus' && (
                        <Input
                          value={extra.courseQuery || ''}
                          onChange={e =>
                            setExtra(prev => ({ ...prev, courseQuery: e.target.value }))
                          }
                          placeholder="course (e.g., fluid mechanics)"
                          className="h-8 text-xs border-border/50 shadow-sm"
                        />
                      )}
                      {command === 'course-page' && (
                        <>
                          <Input
                            value={extra.courseQuery || ''}
                            onChange={e =>
                              setExtra(prev => ({ ...prev, courseQuery: e.target.value }))
                            }
                            placeholder="course (e.g., data structures)"
                            className="h-8 text-xs border-border/50 shadow-sm"
                          />
                          <Input
                            value={extra.materialQuery || ''}
                            onChange={e =>
                              setExtra(prev => ({ ...prev, materialQuery: e.target.value }))
                            }
                            placeholder="materials (e.g., week 5)"
                            className="h-8 text-xs border-border/50 shadow-sm"
                          />
                          <Input
                            value={extra.facultyQuery || ''}
                            onChange={e =>
                              setExtra(prev => ({ ...prev, facultyQuery: e.target.value }))
                            }
                            placeholder="faculty (optional)"
                            className="h-8 text-xs border-border/50 shadow-sm"
                          />
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {selectedCommand?.label}
                        </div>
                        {isLoading && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            processing
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-3">
                        {isLoading && (
                          <Button
                            variant="outline"
                            onClick={stop}
                            className="h-8 px-3 text-xs border-border/50 shadow-sm"
                          >
                            stop
                          </Button>
                        )}
                        <Button
                          onClick={() => runQuery()}
                          disabled={!canRun}
                          className="h-8 px-4 text-xs shadow-sm"
                        >
                          {isLoading ? 'running...' : 'execute'}
                        </Button>
                      </div>
                    </div>

                    {localError && (
                      <div className="p-2 bg-red-50 border border-red-200/60 rounded text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400 shadow-sm">
                        {localError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {mobileView === 'result' && (
            <div className="h-full p-4">
              <div className="h-full bg-card/40 rounded-lg border border-border/30 overflow-hidden backdrop-blur-sm shadow-sm">
                {!display && !isLoading && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mx-auto text-primary-foreground text-sm font-medium border border-primary/20 shadow-sm">
                        {selectedCommand?.label.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ready to execute {selectedCommand?.label}
                      </div>
                    </div>
                  </div>
                )}

                {!display && isLoading && <LoadingSkeleton />}

                {display && (
                  <div
                    className="h-full overflow-y-auto p-4 animate-in fade-in duration-500"
                    key={display.command}
                  >
                    {display.formatted_content ? (
                      <div
                        className="prose prose-slate dark:prose-invert max-w-none prose-sm"
                        dangerouslySetInnerHTML={{ __html: display.formatted_content }}
                      />
                    ) : display.summary ? (
                      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {display.summary}
                      </div>
                    ) : (
                      <pre className="text-xs bg-muted/30 p-4 rounded border border-border/20 overflow-auto text-foreground font-mono shadow-sm">
                        {JSON.stringify(display, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <VTOPCredentialsDialog
        isOpen={showCreds}
        onClose={() => setShowCreds(false)}
        onSubmit={({ username, encryptedPassword }) => {
          setUsername(username)
          setEncryptedPassword(encryptedPassword)
          setLinked(hasVTOPCredentials())
          setShowCreds(false)
        }}
        command={command}
      />
    </div>
  )
}
