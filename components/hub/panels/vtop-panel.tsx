'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/vtop-credentials'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { VTOPCredentialsDialog } from '@/components/vtop-credentials-dialog'

const VTOP_COMMANDS = [
  { id: 'attendance', label: 'attendance', category: 'academic', requiresCreds: true, description: 'view class attendance records' },
  { id: 'timetable', label: 'timetable', category: 'academic', requiresCreds: true, description: 'current semester schedule' },
  { id: 'marks', label: 'marks', category: 'academic', requiresCreds: true, description: 'exam and assignment marks' },
  { id: 'grades', label: 'grades', category: 'academic', requiresCreds: true, description: 'final course grades' },
  { id: 'cgpa', label: 'cgpa', category: 'academic', requiresCreds: true, description: 'cumulative grade point average' },
  { id: 'exam-schedule', label: 'exam schedule', category: 'academic', requiresCreds: true, description: 'upcoming examination dates' },
  { id: 'syllabus', label: 'syllabus', category: 'academic', requiresCreds: false, description: 'course curriculum and topics' },
  { id: 'course-page', label: 'course page', category: 'academic', requiresCreds: false, description: 'search course materials and info' },
  { id: 'receipts', label: 'fee receipts', category: 'finance', requiresCreds: true, description: 'payment history and receipts' },
  { id: 'hostel', label: 'hostel info', category: 'services', requiresCreds: true, description: 'accommodation details' },
  { id: 'library-dues', label: 'library dues', category: 'services', requiresCreds: true, description: 'outstanding book fees' },
  { id: 'nightslip', label: 'night slip', category: 'services', requiresCreds: true, description: 'hostel night out permissions' },
  { id: 'leave', label: 'apply leave', category: 'services', requiresCreds: true, description: 'submit leave applications' },
  { id: 'leave-status', label: 'leave status', category: 'services', requiresCreds: true, description: 'track leave requests' },
  { id: 'msg', label: 'messages', category: 'communication', requiresCreds: true, description: 'system notifications' },
  { id: 'class-message', label: 'class messages', category: 'communication', requiresCreds: true, description: 'faculty announcements' },
  { id: 'da', label: 'da form', category: 'services', requiresCreds: true, description: 'disciplinary action records' },
  { id: 'facility', label: 'facilities', category: 'services', requiresCreds: true, description: 'campus facility bookings' },
]

const CATEGORIES = {
  all: { label: 'all', accent: 'accent-slate-500' },
  academic: { label: 'academic', accent: 'accent-blue-500' },
  finance: { label: 'finance', accent: 'accent-emerald-500' },
  services: { label: 'services', accent: 'accent-violet-500' },
  communication: { label: 'comm', accent: 'accent-amber-500' },
}

export default function VTOPPanel() {
  const { object, submit, isLoading, stop, error: objectError } = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
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

  const filteredCommands = useMemo(() => {
    let filtered = VTOP_COMMANDS
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(cmd => cmd.category === selectedCategory)
    }
    
    if (searchTerm) {
      filtered = filtered.filter(cmd => 
        cmd.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cmd.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    
    return filtered
  }, [selectedCategory, searchTerm])

  const canRun = useMemo(() => {
    if (!command || isLoading) return false
    const selectedCommand = VTOP_COMMANDS.find(cmd => cmd.id === command)
    if (!selectedCommand) return false
    return !selectedCommand.requiresCreds || linked
  }, [command, isLoading, linked])

  const runQuery = async () => {
    const extras: any = {}
    if (command === 'course-page') {
      if (extra.courseQuery) extras.courseQuery = extra.courseQuery
      if (extra.facultyQuery) extras.facultyQuery = extra.facultyQuery
      if (extra.materialQuery) extras.materialQuery = extra.materialQuery
      if (extra.semesterQuery) extras.semesterQuery = extra.semesterQuery
    }
    setLocalError(null)
    setMobileView('result')
    try {
      setDisplay(null)
      await submit({ command, extras })
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
    // when selecting a new command, show its cached result if present; otherwise clear display
    if (command) {
      setDisplay(cache[command] ?? null)
    } else {
      setDisplay(null)
    }
  }, [command])

  const selectedCommand = VTOP_COMMANDS.find(cmd => cmd.id === command)

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* Desktop Layout */}
      <div className="hidden lg:flex h-full">
        {/* sidebar */}
        <div className="w-80 border-r border-border/50 bg-card/60 backdrop-blur-sm flex flex-col">
          {/* header */}
          <div className="flex-shrink-0 p-4 border-b border-border/40">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">vtop</h1>
                <p className="text-xs text-muted-foreground mt-0.5">student portal interface</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${linked ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-xs text-muted-foreground">{linked ? 'linked' : 'auth needed'}</span>
              </div>
            </div>
            
            {!linked && (
              <Button 
                onClick={() => setShowCreds(true)}
                className="w-full h-7 text-xs bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-all duration-200"
              >
                link credentials
              </Button>
            )}
          </div>

          {/* filters */}
            <div className="flex-shrink-0 p-3 space-y-2">
            <Input
              placeholder="search services..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 text-xs bg-muted/30 border border-border/50 focus:border-border transition-all duration-200"
            />

            <div className="flex flex-wrap gap-1">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`
                    px-2 py-1 text-xs rounded-full transition-all duration-200 border
                    ${selectedCategory === key
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'bg-muted/40 text-foreground/80 border-border/50 hover:bg-muted/50'
                    }
                  `}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* command list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-1">
              {filteredCommands.map((cmd, index) => {
                const isSelected = command === cmd.id
                const isDisabled = cmd.requiresCreds && !linked
                
                return (
                  <button
                    key={cmd.id}
                    onClick={() => !isDisabled && setCommand(cmd.id)}
                    disabled={isDisabled}
                    className={`group w-full p-2.5 text-left rounded-lg transition-all duration-200 border
                      ${isSelected 
                        ? 'bg-primary text-primary-foreground border-transparent' 
                        : isDisabled
                          ? 'bg-muted/40 text-muted-foreground border-border/50 cursor-not-allowed'
                          : 'bg-card/70 text-foreground border-border/50 hover:bg-card/80'
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
                          <div className={`w-1.5 h-1.5 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-400'} transition-colors duration-300`} />
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

        {/* main content */}
        <div className="flex-1 flex flex-col">
          {/* action bar */}
          <div className="flex-shrink-0 p-4 border-b border-border/40 bg-card/60 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">
                  {selectedCommand ? selectedCommand.label : 'select a service'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {selectedCommand ? selectedCommand.description : 'choose from the services on the left to get started'}
                </p>
              </div>
              
              {command && (
                <div className="flex items-center gap-3 ml-4">
                  {isLoading && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      processing
                    </div>
                  )}
                  <div className="flex gap-2">
                    {isLoading && (
                      <Button 
                        variant="outline"
                        onClick={stop}
                        className="h-7 px-3 text-xs"
                      >
                        stop
                      </Button>
                    )}
                    <Button 
                      onClick={runQuery}
                      disabled={!canRun}
                      className="h-7 px-4 text-xs"
                    >
                      {isLoading ? 'running...' : 'execute'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {localError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400">
                {localError}
              </div>
            )}

            {/* course page fields */}
            {command === 'course-page' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input
                  value={extra.courseQuery || ''}
                  onChange={e => setExtra(prev => ({ ...prev, courseQuery: e.target.value }))}
                  placeholder="course query"
                  className="h-7 text-xs bg-white/80 dark:bg-slate-800/80 border-slate-200/50 dark:border-slate-600/50"
                />
                <Input
                  value={extra.facultyQuery || ''}
                  onChange={e => setExtra(prev => ({ ...prev, facultyQuery: e.target.value }))}
                  placeholder="faculty name"
                  className="h-7 text-xs bg-white/80 dark:bg-slate-800/80 border-slate-200/50 dark:border-slate-600/50"
                />
              </div>
            )}
          </div>

          {/* results - fills remaining space exactly */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full bg-card/60 rounded-lg ring-1 ring-border/20 overflow-hidden backdrop-blur-sm">
              {!command && !display && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto">
                      <div className="w-6 h-6 border-2 border-slate-300 dark:border-slate-500 rounded-full border-dashed animate-spin" />
                    </div>
                    <div className="text-sm text-muted-foreground">waiting for service selection</div>
                  </div>
                </div>
              )}

              {command && !display && !isLoading && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-900 dark:bg-slate-100 flex items-center justify-center mx-auto text-white dark:text-slate-900 text-sm font-medium">
                      {selectedCommand?.label.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-sm text-muted-foreground">ready to execute {selectedCommand?.label}</div>
                  </div>
                </div>
              )}

              {!display && isLoading && (
                <div className="h-full p-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-sm text-muted-foreground">fetching {selectedCommand?.label}</span>
                    </div>
                    <div className="space-y-3 animate-pulse">
                      <div className="h-3 bg-muted/40 rounded w-3/4" />
                      <div className="h-3 bg-muted/40 rounded w-full" />
                      <div className="h-3 bg-muted/40 rounded w-2/3" />
                      <div className="h-3 bg-muted/40 rounded w-5/6" />
                      <div className="h-3 bg-muted/40 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              )}

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
                    <pre className="text-xs bg-muted/30 p-4 rounded ring-1 ring-border/20 overflow-auto text-foreground font-mono">
                      {JSON.stringify(display, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
        <div className="lg:hidden h-full flex flex-col bg-background">
        {/* Mobile Header */}
        <div className="flex-shrink-0 p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">vtop</h1>
              <div className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </div>
            <div className="flex items-center gap-2">
              {command && (
                <Button
                  onClick={() => setMobileView(mobileView === 'select' ? 'result' : 'select')}
                  variant="outline"
                  className="h-8 px-3 text-xs"
                >
                  {mobileView === 'select' ? 'view result' : 'select service'}
                </Button>
              )}
              {!linked && (
                <Button 
                  onClick={() => setShowCreds(true)}
                  className="h-8 px-3 text-xs bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  link
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 overflow-hidden">
          {mobileView === 'select' && (
            <div className="h-full flex flex-col">
              {/* Mobile Filters */}
              <div className="flex-shrink-0 p-4 space-y-3 bg-card/60">
                <Input
                  placeholder="search services..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className={`
                        flex-shrink-0 px-3 py-1.5 text-xs rounded-full transition-all duration-200 border
                        ${selectedCategory === key
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : 'bg-card/70 text-foreground border-border/50 hover:bg-card/80'
                        }
                      `}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Command List */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {filteredCommands.map((cmd) => {
                    const isSelected = command === cmd.id
                    const isDisabled = cmd.requiresCreds && !linked
                    
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => {
                          if (!isDisabled) {
                            setCommand(cmd.id)
                            // if we have cached result for this cmd, auto-switch to result view; else keep selection view
                            if (cache[cmd.id]) setMobileView('result')
                          }
                        }}
                        disabled={isDisabled}
                        className={`w-full p-4 text-left rounded-lg transition-all duration-200 border
                          ${isSelected 
                            ? 'bg-primary text-primary-foreground border-transparent' 
                            : isDisabled
                              ? 'bg-muted/40 text-muted-foreground border-border/50 cursor-not-allowed'
                              : 'bg-card/70 text-foreground border-border/50 hover:bg-card/80'
                          }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">{cmd.label}</div>
                            <div className="text-xs opacity-70 line-clamp-2">{cmd.description}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-3">
                            {cmd.requiresCreds && (
                              <div className={`w-2 h-2 rounded-full ${linked ? 'bg-emerald-500' : 'bg-amber-400'}`} />
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

              {/* Mobile Action Bar */}
              {command && (
                <div className="flex-shrink-0 p-4 bg-card/60 backdrop-blur-sm border-t border-border/50">
                  <div className="space-y-3">
                    {command === 'course-page' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={extra.courseQuery || ''}
                          onChange={e => setExtra(prev => ({ ...prev, courseQuery: e.target.value }))}
                          placeholder="course query"
                          className="h-8 text-xs"
                        />
                        <Input
                          value={extra.facultyQuery || ''}
                          onChange={e => setExtra(prev => ({ ...prev, facultyQuery: e.target.value }))}
                          placeholder="faculty"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                          {selectedCommand?.label}
                        </div>
                        {isLoading && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            processing
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-3">
                        {isLoading && (
                          <Button variant="outline" onClick={stop} className="h-8 px-3 text-xs">
                            stop
                          </Button>
                        )}
                        <Button 
                          onClick={runQuery}
                          disabled={!canRun}
                          className="h-8 px-4 text-xs"
                        >
                          {isLoading ? 'running...' : 'execute'}
                        </Button>
                      </div>
                    </div>
                    
                    {localError && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
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
              <div className="h-full bg-card/60 rounded-lg ring-1 ring-border/20 overflow-hidden backdrop-blur-sm">
                {!display && !isLoading && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-900 dark:bg-slate-900 flex items-center justify-center mx-auto text-white dark:text-slate-900 text-sm font-medium">
                        {selectedCommand?.label.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">ready to execute {selectedCommand?.label}</div>
                    </div>
                  </div>
                )}

                {!display && isLoading && (
                  <div className="h-full p-4">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-sm text-slate-600 dark:text-slate-400">fetching {selectedCommand?.label}</span>
                      </div>
                      <div className="space-y-3 animate-pulse">
                        <div className="h-3 bg-slate-200 dark:bg-slate-600/50 rounded w-3/4" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-600/50 rounded w-full" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-600/50 rounded w-2/3" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-600/50 rounded w-5/6" />
                        <div className="h-3 bg-slate-200 dark:bg-slate-600/50 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                )}

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
                      <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {display.summary}
                      </div>
                    ) : (
                      <pre className="text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded border border-slate-200/50 dark:border-slate-600/30 overflow-auto text-slate-700 dark:text-slate-200 font-mono">
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
