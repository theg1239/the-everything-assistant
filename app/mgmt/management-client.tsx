'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Eye,
  EyeOff,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import TokenUsage from './components/token-usage'
import MessagesViewerDialog from './components/messages-viewer'
import UsersList from './components/users-list'
import UserMessages from './components/user-messages'
import SystemHealth from './components/system-health'
import BroadcastForm from './components/broadcast-form'
import PastBroadcasts from './components/past-broadcasts'
import SystemStatistics from './components/system-statistics'
import APIKeyManagement from './components/api-key-mgmt'
import UserRateLimiting from './components/user-rate-limiting'
import ManagementActions from './components/mgmt-actions'
import BriefingDispatch from './components/briefing-dispatch'
import MgmtLayout from './components/mgmt-layout'
import MgmtTabBar from './components/mgmt-tabbar'
import Overview from './components/overview'

type UsageLog = {
  id: string
  userId?: string | null
  chatId?: string | null
  model?: string | null
  stepIndex?: number | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: string
}
import { BroadcastDialog } from '@/components/broadcast-dialog'
import { readJson } from '@/lib/http'

interface RateLimitStatus {
  status: string
  timestamp: string
  environment: {
    validation: {
      isValid: boolean
      errors: string[]
      warnings: string[]
    }
    summary: {
      hasRedis: boolean
      apiKeys: {
        totalAvailable: number
      }
      adminAccess: {
        email: string
      }
    }
  }
  configuration: {
    apiKeys: {
      enableRotation: boolean
      rotateOnRateLimit: boolean
      keyCount: number
      rateLimit: {
        requestsPerMinute: number
        requestsPerHour: number
      }
      retryConfig: {
        maxRetries: number
        baseDelay: number
        maxDelay: number
      }
      keyHealthCheckInterval: number
    }
    userRateLimit: {
      enabled: boolean
      requestsPerMinute: number
      requestsPerHour: number
      requestsPerDay: number
    }
  }
  keyUsage: {
    [keyIndex: string]: {
      requests: number
      failures: number
      lastUsed: number | null
      lastFailed: number | null
      availableTokens: {
        minute: number
        hour: number
        day: number
      }
      isRateLimited: boolean
      isCurrent: boolean
    }
  }
  healthCheck: {
    redis: string
    apiKeys: string
  }
}

interface Stats {
  totalUsers: number
  messagesInLast30Minutes: number
  toolCallStats: {
    toolName: string
    count: number
  }[]
}

interface BroadcastSlide {
  title: string
  text: string
  image: string
}

interface PastBroadcast {
  id: string
  slides: BroadcastSlide[]
  timestamp: string
  sentBy: string
}

export default function ManagementClient() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [data, setData] = useState<RateLimitStatus | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [showSensitiveData, setShowSensitiveData] = useState(true)
  const [broadcastSlides, setBroadcastSlides] = useState([{ title: '', text: '', image: '' }])
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcast[]>([])
  const [editingBroadcast, setEditingBroadcast] = useState<string | null>(null)
  const [editSlides, setEditSlides] = useState<BroadcastSlide[]>([])
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showEditPreview, setShowEditPreview] = useState(false)
  const [usage, setUsage] = useState<{
    recent: UsageLog[]
    summary: any
    summaryAllTime?: any
  } | null>(null)
  const [usageOpen, setUsageOpen] = useState(true)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [viewerData, setViewerData] = useState<{
    chatId: string
    user: { id: string; name: string | null; email: string | null } | null
    messages: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }[]
  } | null>(null)

  const openMessagesViewer = useCallback(async (chatId: string) => {
    if (!chatId) return
    try {
      setViewerError(null)
      setViewerLoading(true)
      setViewerOpen(true)
      const res = await fetch(`/api/chat-messages/${chatId}`)
      if (!res.ok) {
        let errorPayload: { error?: string } = {}
        try {
          errorPayload = await readJson<{ error?: string }>(res)
        } catch {
          errorPayload = {}
        }
        throw new Error(errorPayload.error || 'Failed to fetch messages')
      }
      const data = await readJson<{
        chatId: string
        user: { id: string; name: string | null; email: string | null } | null
        messages: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }[]
      }>(res)
      setViewerData(data)
    } catch (e: any) {
      setViewerError(e?.message || 'Failed to fetch messages')
    } finally {
      setViewerLoading(false)
    }
  }, [])

  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [usersOpen, setUsersOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rateLimitRes, statsRes, usageRes] = await Promise.all([
        fetch('/api/rate-limit-status'),
        fetch('/api/stats'),
        fetch('/api/usage?limit=25&days=1'),
      ])

      if (!rateLimitRes.ok) {
        let json: { error?: string } = {}
        try {
          json = await readJson<{ error?: string }>(rateLimitRes)
        } catch {
          json = {}
        }
        throw new Error(json.error || 'Failed to fetch rate limit status')
      }
      if (!statsRes.ok) {
        let json: { error?: string } = {}
        try {
          json = await readJson<{ error?: string }>(statsRes)
        } catch {
          json = {}
        }
        throw new Error(json.error || 'Failed to fetch stats')
      }
      if (!usageRes.ok) {
        let json: { error?: string } = {}
        try {
          json = await readJson<{ error?: string }>(usageRes)
        } catch {
          json = {}
        }
        throw new Error(json.error || 'Failed to fetch usage')
      }

      const rateLimitData = await readJson<RateLimitStatus>(rateLimitRes)
      const statsData = await readJson<Stats>(statsRes)
      const usageData = await readJson<{
        recent: UsageLog[]
        summary: any
        summaryAllTime?: any
      }>(usageRes)

      setData(rateLimitData)
      setStats(statsData)
      setUsage(usageData)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPastBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true)
    try {
      const res = await fetch('/api/broadcast')
      if (!res.ok) {
        let json: { error?: string } = {}
        try {
          json = await readJson<{ error?: string }>(res)
        } catch {
          json = {}
        }
        throw new Error(json.error || 'Failed to fetch past broadcasts')
      }
      const data = await readJson<{ broadcasts?: PastBroadcast[] }>(res)
      setPastBroadcasts(data.broadcasts || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch past broadcasts')
    } finally {
      setLoadingBroadcasts(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=%2Fmgmt')
      return
    }
    if (status === 'authenticated') {
      fetchData()
      fetchPastBroadcasts()
    }
  }, [status, router, fetchData, fetchPastBroadcasts])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches
      setUsageOpen(!isMobile)
    }
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(fetchData, 10000)
    return () => clearInterval(iv)
  }, [autoRefresh, fetchData])

  const handleSlideChange = (index: number, field: string, value: string) => {
    const newSlides = [...broadcastSlides]
    newSlides[index] = { ...newSlides[index], [field]: value }
    setBroadcastSlides(newSlides)
  }

  const addSlide = () => {
    setBroadcastSlides([...broadcastSlides, { title: '', text: '', image: '' }])
  }

  const removeSlide = (index: number) => {
    if (broadcastSlides.length > 1) {
      const newSlides = broadcastSlides.filter((_, i) => i !== index)
      setBroadcastSlides(newSlides)
    }
  }

  const handleSendBroadcast = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: broadcastSlides }),
      })
      const json = await readJson<{ error?: string; message?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Broadcast failed')
      toast.success(json.message || 'Broadcast sent')
      setBroadcastSlides([{ title: '', text: '', image: '' }])
      fetchPastBroadcasts()
    } catch (err: any) {
      toast.error(err.message || 'Broadcast failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEditBroadcast = (broadcast: PastBroadcast) => {
    setEditingBroadcast(broadcast.id)
    setEditSlides([...broadcast.slides])
  }

  const handleSaveEditedBroadcast = async () => {
    if (!editingBroadcast) return
    setLoading(true)
    try {
      const res = await fetch('/api/broadcast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingBroadcast, slides: editSlides }),
      })
      const json = await readJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Failed to update broadcast')
      toast.success('Broadcast updated successfully')
      setEditingBroadcast(null)
      setEditSlides([])
      fetchPastBroadcasts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update broadcast')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteBroadcast = async (id: string) => {
    if (!confirm('Are you sure you want to delete this broadcast? This action cannot be undone.')) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/broadcast', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await readJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Failed to delete broadcast')
      toast.success('Broadcast deleted successfully')
      fetchPastBroadcasts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete broadcast')
    } finally {
      setLoading(false)
    }
  }

  const handleEditSlideChange = (index: number, field: string, value: string) => {
    const newSlides = [...editSlides]
    newSlides[index] = { ...newSlides[index], [field]: value }
    setEditSlides(newSlides)
  }

  const addEditSlide = () => {
    setEditSlides([...editSlides, { title: '', text: '', image: '' }])
  }

  const removeEditSlide = (index: number) => {
    if (editSlides.length > 1) {
      const newSlides = editSlides.filter((_, i) => i !== index)
      setEditSlides(newSlides)
    }
  }

  const handleAction = async (action: string, config?: any) => {
    setLoading(true)
    try {
      const res = await fetch('/api/rate-limit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, config }),
      })
      const json = await readJson<{ error?: string; message?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Action failed')
      toast.success(json.message || 'Action completed')
      await fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (ts: number | null) => {
    return ts ? new Date(ts).toLocaleString() : 'Never'
  }

  const getStatusColor = (isHealthy: boolean) => (isHealthy ? 'text-green-500' : 'text-red-500')
  const getStatusIcon = (isHealthy: boolean) => (isHealthy ? CheckCircle : XCircle)

  if (status === 'loading') {
    return (
      <div className="flex flex-col h-screen bg-transparent">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading...
          </div>
        </div>
      </div>
    )
  }

  const [activeTab, setActiveTab] = useState<
    'overview' | 'tokens' | 'broadcasts' | 'keys' | 'stats' | 'users'
  >('overview')

  return (
    <MgmtLayout
      title="mgmt"
      subtitle="monitor system health, tokens, broadcasts, and keys"
      nav={<MgmtTabBar active={activeTab} onChange={(t: any) => setActiveTab(t)} />}
    >

      {error && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="rounded-lg bg-destructive/10 backdrop-blur-sm border border-destructive/20 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">error: {error}</span>
            </div>
          </div>
        </motion.div>
      )}

      {!data && loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-12"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" /> loading status...
          </div>
        </motion.div>
      )}

      {data && (
        <div className="space-y-6">
          <MessagesViewerDialog
            viewerOpen={viewerOpen}
            setViewerOpen={setViewerOpen}
            viewerLoading={viewerLoading}
            viewerError={viewerError}
            viewerData={viewerData}
          />

          {activeTab === 'overview' && <Overview stats={stats} usage={usage} />}

          {activeTab === 'tokens' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <TokenUsage
                usage={usage}
                usageOpen={usageOpen}
                setUsageOpen={setUsageOpen}
                openMessagesViewer={openMessagesViewer}
              />
            </motion.div>
          )}

          {activeTab === 'broadcasts' && (
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <BroadcastForm
                  broadcastSlides={broadcastSlides}
                  handleSlideChange={handleSlideChange}
                  addSlide={addSlide}
                  removeSlide={removeSlide}
                  setShowPreview={setShowPreview}
                  handleSendBroadcast={handleSendBroadcast}
                  loading={loading}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <PastBroadcasts
                  pastBroadcasts={pastBroadcasts}
                  loadingBroadcasts={loadingBroadcasts}
                  editingBroadcast={editingBroadcast}
                  setEditingBroadcast={setEditingBroadcast}
                  editSlides={editSlides}
                  setEditSlides={setEditSlides}
                  handleEditBroadcast={handleEditBroadcast}
                  handleDeleteBroadcast={handleDeleteBroadcast}
                  handleEditSlideChange={handleEditSlideChange}
                  addEditSlide={addEditSlide}
                  removeEditSlide={removeEditSlide}
                  showEditPreview={showEditPreview}
                  setShowEditPreview={setShowEditPreview}
                  handleSaveEditedBroadcast={handleSaveEditedBroadcast}
                  loading={loading}
                />
              </motion.div>
            </div>
          )}

          {activeTab === 'keys' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <APIKeyManagement
                data={data}
                showSensitiveData={showSensitiveData}
                formatTimestamp={formatTimestamp}
              />
            </motion.div>
          )}

          {activeTab === 'stats' && stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <SystemStatistics stats={stats} />
            </motion.div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <UserRateLimiting data={data} />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <ManagementActions handleAction={handleAction} loading={loading} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                <BriefingDispatch />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
              >
                <div className="rounded-lg border border-border/20 p-4 bg-black/10">
                  <h3 className="lowercase font-medium mb-2">users</h3>
                  <UsersList
                    onSelectUser={(u: any) => {
                      setSelectedUser(u)
                      setUsersOpen(true)
                    }}
                  />
                </div>
              </motion.div>


              {usersOpen && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
                  <div
                    className="absolute inset-0 bg-black/50"
                    onClick={() => {
                      setUsersOpen(false)
                      setSelectedUser(null)
                    }}
                  />
                  <div className="relative w-full max-w-3xl bg-background rounded-lg p-4">
                    <UserMessages
                      user={selectedUser}
                      onClose={() => {
                        setUsersOpen(false)
                        setSelectedUser(null)
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      <BroadcastDialog
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        payload={{
          slides:
            broadcastSlides.filter(
              slide => slide.title.trim() || slide.text.trim() || slide.image.trim()
            ).length > 0
              ? broadcastSlides.filter(
                  slide => slide.title.trim() || slide.text.trim() || slide.image.trim()
                )
              : [
                  {
                    title: 'Preview',
                    text: 'No content to preview yet. Add a title, text, or image to see the preview.',
                    image: '/onboarding-artwork/artwork1.png',
                  },
                ],
        }}
      />

      <BroadcastDialog
        isOpen={showEditPreview}
        onClose={() => setShowEditPreview(false)}
        payload={{
          slides:
            editSlides.filter(
              slide => slide.title.trim() || slide.text.trim() || slide.image.trim()
            ).length > 0
              ? editSlides.filter(
                  slide => slide.title.trim() || slide.text.trim() || slide.image.trim()
                )
              : [
                  {
                    title: 'Preview',
                    text: 'No content to preview yet. Add a title, text, or image to see the preview.',
                    image: '/onboarding-artwork/artwork1.png',
                  },
                ],
        }}
      />
    </MgmtLayout>
  )
}
