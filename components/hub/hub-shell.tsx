'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { GraduationCap, FileSearch, UtensilsCrossed, Briefcase, Users, ArrowLeft } from 'lucide-react'
import VTOPPanel from './panels/vtop-panel'
import PastPapersPanel from './panels/past-papers-panel'
import MessMenuPanel from './panels/mess-menu-panel'
import PlacementPanel from './panels/placement-panel'
import FacultyPanel from './panels/faculty-panel'
import { hasVTOPCredentials } from '@/lib/vtop-credentials'
import QuickActions from './quick-actions'
import ResultViewer from './result-viewer'

type Page = 'home' | 'vtop' | 'papers' | 'mess' | 'placements' | 'faculty'

export default function HubShell() {
  const [page, setPage] = useState<Page>('home')
  const [linked] = useState<boolean>(hasVTOPCredentials())
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState<string>('result')
  const [viewerData, setViewerData] = useState<any>(null)
  const [viewerMode, setViewerMode] = useState<'static' | 'stream'>('static')
  const [viewerLoading, setViewerLoading] = useState<boolean>(false)
  const [viewerStop, setViewerStop] = useState<(() => void) | undefined>(undefined)

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
      default:
        return 'main hub'
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
      default:
        return null
    }
  }, [page])

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 sm:p-4 border-b border-border/60 bg-card/60 sticky top-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            {page !== 'home' && (
              <Button variant="ghost" size="sm" onClick={() => setPage('home')} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="text-sm sm:text-base font-semibold">{title}</div>
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

      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
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
    <Card className={`transition-colors border-0 ${disabled ? 'opacity-75' : 'hover:bg-muted/50'}`}>
      <button onClick={onClick} disabled={disabled} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-muted/70 flex items-center justify-center">
              {icon}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</div>
            </div>
            <div>
              <span className="text-xs text-blue-400">{cta || 'open'}</span>
            </div>
          </div>
        </CardContent>
      </button>
    </Card>
  )
}
