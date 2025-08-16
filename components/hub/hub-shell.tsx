'use client'

import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { GraduationCap, FileSearch, UtensilsCrossed, Briefcase, Users, Home, Flame } from 'lucide-react'
import VTOPPanel from './panels/vtop-panel'
import PastPapersPanel from './panels/past-papers-panel'
import MessMenuPanel from './panels/mess-menu-panel'
import PlacementPanel from './panels/placement-panel'
import FacultyPanel from './panels/faculty-panel'
import RedditPanel from './panels/reddit-panel'
import { hasVTOPCredentials } from '@/lib/vtop-credentials'
import QuickActions from './quick-actions'
import ResultViewer from './result-viewer'

type Page = 'home' | 'vtop' | 'papers' | 'mess' | 'placements' | 'faculty' | 'reddit'

export default function HubShell() {
  const [page, setPage] = useState<Page>('home')
  const [linked] = useState<boolean>(hasVTOPCredentials())
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState<string>('result')
  const [viewerData, setViewerData] = useState<any>(null)
  const [viewerMode, setViewerMode] = useState<'static' | 'stream'>('static')
  const [viewerLoading, setViewerLoading] = useState<boolean>(false)
  const [viewerStop, setViewerStop] = useState<(() => void) | undefined>(undefined)

  // Keyboard shortcuts: 1=home, 2=vtop, 3=papers, 4=mess, 5=placements, 6=faculty, 7=reddit
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement | null
      const activeEl = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null)
      const isTypingContext = (el: HTMLElement | null) => {
        if (!el) return false
        if (el instanceof HTMLTextAreaElement) return true
        if (el instanceof HTMLInputElement) {
          if (el.readOnly || el.disabled) return false
          const t = (el.type || '').toLowerCase()
          const typingTypes = new Set([
            'text','search','url','tel','email','password','number','date','time','datetime-local','month','week'
          ])
          return typingTypes.has(t)
        }
        if (el.isContentEditable) return true
        const role = el.getAttribute('role')?.toLowerCase()
        if (role === 'textbox' || role === 'combobox' || role === 'searchbox' || role === 'spinbutton') return true
        return !!el.closest('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]')
      }
      const path: any[] = (e as any).composedPath?.() || []
      const pathHasTyping = path.some(el => el instanceof HTMLElement && isTypingContext(el))
      const activeIsBody = !activeEl || activeEl === document.body
      if (isTypingContext(target) || isTypingContext(activeEl) || pathHasTyping || !activeIsBody) return
      const map: Record<string, Page> = {
        '1': 'home',
        '2': 'vtop',
        '3': 'papers',
        '4': 'mess',
        '5': 'placements',
        '6': 'faculty',
        '7': 'reddit',
      }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        setPage(next)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const title = useMemo(() => {
    switch (page) {
      case 'vtop':
        return 'vtop'
      case 'papers':
        return 'past papers'
      case 'mess':
        return 'mess menu'
      case 'placements':
        return 'placements'
      case 'faculty':
        return 'faculty'
      case 'reddit':
        return 'reddit'
      default:
        return 'home'
    }
  }, [page])

  const Panel = useMemo(() => {
    switch (page) {
      case 'vtop':
        return <VTOPPanel />
      case 'papers':
        return <PastPapersPanel />
      case 'mess':
        return <MessMenuPanel />
      case 'placements':
        return <PlacementPanel />
      case 'faculty':
        return <FacultyPanel />
      case 'reddit':
        return <RedditPanel />
      default:
        return null
    }
  }, [page])

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 sm:p-4 border-b border-border/60 bg-card/60 sticky top-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="px-1 text-sm sm:text-base font-semibold tracking-wide">{title}</div>
            <div className="hidden md:flex items-center text-[11px] text-muted-foreground">
              press 1-7 to switch
            </div>
            <div className="md:hidden">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setPage('home')} aria-label="Go to home">
                <Home className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] hidden md:block">
            <div className="flex gap-1.5">
              {([ 
                { id: 'home', label: 'home', icon: <Home className="h-3.5 w-3.5" /> },
                { id: 'vtop', label: 'vtop', icon: <GraduationCap className="h-3.5 w-3.5" /> },
                { id: 'papers', label: 'past papers', icon: <FileSearch className="h-3.5 w-3.5" /> },
                { id: 'mess', label: 'mess menu', icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
                { id: 'placements', label: 'placements', icon: <Briefcase className="h-3.5 w-3.5" /> },
                { id: 'faculty', label: 'faculty', icon: <Users className="h-3.5 w-3.5" /> },
                { id: 'reddit', label: 'reddit', icon: <Flame className="h-3.5 w-3.5" /> },
              ] as { id: Page; label: string; icon: React.ReactNode }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setPage(tab.id)}
                  aria-pressed={page === tab.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                    page === tab.id
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {tab.icon}
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
          {page === 'home' && (
            <div className="mt-3">
              <QuickActions
                onShowResult={(t, r) => {
                  setViewerTitle(t)
                  setViewerData(r)
                  setViewerMode('static')
                  setViewerLoading(false)
                  setViewerStop(undefined)
                  setViewerOpen(true)
                }}
                onShowStream={(t, object, isLoading, stop) => {
                  setViewerTitle(t)
                  setViewerData(object || null)
                  setViewerMode('stream')
                  setViewerLoading(isLoading)
                  setViewerStop(() => stop)
                  setViewerOpen(true)
                }}
                goTo={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-3 sm:p-5 [-webkit-overflow-scrolling:touch]"
        data-allow-touch-scroll
      >
        <div className="max-w-6xl mx-auto">
          {page === 'home' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <HubTile
                title="vtop"
                description={linked ? 'access your attendance, marks, timetable, and more' : 'link credentials to access your personal data'}
                icon={<GraduationCap className="h-5 w-5" />}
                onClick={() => setPage('vtop')}
                cta={linked ? 'open' : 'link now'}
              />
              <HubTile
                title="past papers"
                description="find previous exam papers by course"
                icon={<FileSearch className="h-5 w-5" />}
                onClick={() => setPage('papers')}
              />
              <HubTile
                title="mess menu"
                description="today's menu for your hostel"
                icon={<UtensilsCrossed className="h-5 w-5" />}
                onClick={() => setPage('mess')}
              />
              <HubTile
                title="placements"
                description="latest placement stats and info"
                icon={<Briefcase className="h-5 w-5" />}
                onClick={() => setPage('placements')}
              />
              <HubTile
                title="faculty"
                description="search faculty and their courses"
                icon={<Users className="h-5 w-5" />}
                onClick={() => setPage('faculty')}
              />
              <HubTile
                title="reddit knowledge"
                description="search community insights and trending topics"
                icon={<Flame className="h-5 w-5" />}
                onClick={() => setPage('reddit')}
              />
            </div>
          ) : (
            Panel
          )}
          <div className="h-2" />
        </div>
      </div>
      <ResultViewer
        open={viewerOpen}
        title={viewerTitle}
        result={viewerData}
        mode={viewerMode}
        isLoading={viewerLoading}
        onStop={viewerStop}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

function HubTile({ title, description, icon, onClick, disabled, cta }: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  cta?: string
}) {
  return (
    <Card className={`group transition-all border border-border/60 ${disabled ? 'opacity-70' : 'hover:border-primary/40 hover:shadow-lg hover:shadow-black/10'}`}>
      <button onClick={onClick} disabled={disabled} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center ring-1 ring-border/50">
              {icon}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium tracking-wide">{title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</div>
            </div>
            <div>
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-border/60 text-foreground/80 group-hover:border-primary/40 group-hover:text-primary/90 transition-colors">
                {cta || 'open'}
              </span>
            </div>
          </div>
        </CardContent>
      </button>
    </Card>
  )
}
