'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import TokenUsage from './components/token-usage'
import MessagesViewerDialog from './components/messages-viewer'
import UsersList from './components/users-list'
import UserMessages from './components/user-messages'
import SystemHealth from './components/system-health'
import BroadcastForm from './components/broadcast-form'
import PastBroadcasts from './components/past-broadcasts'
import SystemStatistics from './components/system-statistics'
import UserRateLimiting from './components/user-rate-limiting'
// import BriefingDispatch from './components/briefing-dispatch'
import MgmtLayout from './components/mgmt-layout'
import MgmtTabBar from './components/mgmt-tabbar'
import Overview from './components/overview'

import { BroadcastDialog } from '@/components/broadcast-dialog'
import { readApiMessage, readJson } from '@/lib/http'
import {
  rateLimitStatusResponseSchema,
  type RateLimitStatusResponse,
} from '@/types/api/rate-limit'
import {
  pastBroadcastsResponseSchema,
  type BroadcastSlide,
  type PastBroadcast,
} from '@/types/api/broadcast'
import { chatViewerDataSchema, statsResponseSchema, usageResponseSchema } from '@/types/api/mgmt'
import {
  errorMessage,
  type BroadcastSlideField,
  type ChatViewerData,
  type MgmtTab,
  type MgmtUser,
  type StatsResponse,
  type UsageResponse,
} from './types'

const emptySlide = (): BroadcastSlide => ({ title: '', text: '', image: '' })

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const { error } = await readApiMessage(res)
  return error || fallback
}

export default function ManagementClient() {
  const { status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [autoRefresh] = useState(false)
  const [data, setData] = useState<RateLimitStatusResponse | null>(null)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setLastUpdate] = useState<Date | null>(null)
  const [broadcastSlides, setBroadcastSlides] = useState<BroadcastSlide[]>([emptySlide()])
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcast[]>([])
  const [editingBroadcast, setEditingBroadcast] = useState<string | null>(null)
  const [editSlides, setEditSlides] = useState<BroadcastSlide[]>([])
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showEditPreview, setShowEditPreview] = useState(false)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [usageOpen, setUsageOpen] = useState(true)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [viewerData, setViewerData] = useState<ChatViewerData | null>(null)
  const [activeTab, setActiveTab] = useState<MgmtTab>('overview')
  const [resettingUserId, setResettingUserId] = useState<string | null>(null)

  const openMessagesViewer = useCallback(async (chatId: string) => {
    if (!chatId) return
    try {
      setViewerError(null)
      setViewerLoading(true)
      setViewerOpen(true)
      const res = await fetch(`/api/chat-messages/${chatId}`)
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to fetch messages'))
      }
      setViewerData(await readJson(res, chatViewerDataSchema))
    } catch (e) {
      setViewerError(errorMessage(e, 'Failed to fetch messages'))
    } finally {
      setViewerLoading(false)
    }
  }, [])

  const [selectedUser, setSelectedUser] = useState<MgmtUser | null>(null)
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
        throw new Error(await readErrorMessage(rateLimitRes, 'Failed to fetch rate limit status'))
      }
      if (!statsRes.ok) {
        throw new Error(await readErrorMessage(statsRes, 'Failed to fetch stats'))
      }
      if (!usageRes.ok) {
        throw new Error(await readErrorMessage(usageRes, 'Failed to fetch usage'))
      }

      const [rateLimitData, statsData, usageData] = await Promise.all([
        readJson(rateLimitRes, rateLimitStatusResponseSchema),
        readJson(statsRes, statsResponseSchema),
        readJson(usageRes, usageResponseSchema),
      ])

      setData(rateLimitData)
      setStats(statsData)
      setUsage(usageData)
      setLastUpdate(new Date())
    } catch (err) {
      setError(errorMessage(err, 'Failed to fetch data'))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPastBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true)
    try {
      const res = await fetch('/api/broadcast')
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to fetch past broadcasts'))
      }
      const data = await readJson(res, pastBroadcastsResponseSchema)
      setPastBroadcasts(data.broadcasts)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to fetch past broadcasts'))
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

  const updateSlide = (
    slides: BroadcastSlide[],
    index: number,
    field: BroadcastSlideField,
    value: string
  ): BroadcastSlide[] =>
    slides.map((slide, i) => (i === index ? { ...slide, [field]: value } : slide))

  const handleSlideChange = (index: number, field: BroadcastSlideField, value: string) => {
    setBroadcastSlides(updateSlide(broadcastSlides, index, field, value))
  }

  const addSlide = () => {
    setBroadcastSlides([...broadcastSlides, emptySlide()])
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
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Broadcast failed'))
      toast.success('Broadcast sent')
      setBroadcastSlides([emptySlide()])
      fetchPastBroadcasts()
    } catch (err) {
      toast.error(errorMessage(err, 'Broadcast failed'))
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
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to update broadcast'))
      toast.success('Broadcast updated successfully')
      setEditingBroadcast(null)
      setEditSlides([])
      fetchPastBroadcasts()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update broadcast'))
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
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to delete broadcast'))
      toast.success('Broadcast deleted successfully')
      fetchPastBroadcasts()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete broadcast'))
    } finally {
      setLoading(false)
    }
  }

  const handleEditSlideChange = (index: number, field: BroadcastSlideField, value: string) => {
    setEditSlides(updateSlide(editSlides, index, field, value))
  }

  const addEditSlide = () => {
    setEditSlides([...editSlides, emptySlide()])
  }

  const removeEditSlide = (index: number) => {
    if (editSlides.length > 1) {
      const newSlides = editSlides.filter((_, i) => i !== index)
      setEditSlides(newSlides)
    }
  }

  const handleResetUserRateLimits = async (user: MgmtUser) => {
    const label = user.email || user.name || user.id
    if (!confirm(`Reset rate limits for ${label}?`)) return
    setResettingUserId(user.id)
    try {
      const res = await fetch('/api/rate-limit-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_user_limits', userId: user.id }),
      })
      const json = await readApiMessage(res)
      if (!res.ok) throw new Error(json.error || 'Failed to reset rate limits')
      toast.success(json.message || 'User rate limits reset')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to reset rate limits'))
    } finally {
      setResettingUserId(null)
    }
  }

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

  return (
    <MgmtLayout
      title="mgmt"
      subtitle="monitor system health, tokens, broadcasts, and users"
      nav={<MgmtTabBar active={activeTab} onChange={setActiveTab} />}
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

          {activeTab === 'overview' && (
            <div className="space-y-6">
              <SystemHealth data={data} />
              <Overview stats={stats} usage={usage} />
            </div>
          )}

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
                transition={{ delay: 0.12 }}
              >
                {/* <BriefingDispatch /> */}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
              >
                <div className="rounded-lg border border-border/20 p-4 bg-black/10">
                  <h3 className="lowercase font-medium mb-2">users</h3>
                  <UsersList
                    onSelectUser={u => {
                      setSelectedUser(u)
                      setUsersOpen(true)
                    }}
                    onResetRateLimits={handleResetUserRateLimits}
                    resettingUserId={resettingUserId}
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
                    image: '/onboarding-artwork/artwork.webp',
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
                    image: '/onboarding-artwork/artwork.webp',
                  },
                ],
        }}
      />
    </MgmtLayout>
  )
}
