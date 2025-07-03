'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Activity,
  RefreshCw,
  RotateCcw,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Key,
  Server,
  Database,
  Play,
  Pause,
  Settings,
  Eye,
  EyeOff,
  Loader2,
  Edit,
  History,
  Calendar,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Send, Trash2 } from 'lucide-react'
import { BroadcastDialog } from '@/components/broadcast-dialog'

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

export default function ManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [data, setData] = useState<RateLimitStatus | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [showSensitiveData, setShowSensitiveData] = useState(false)
  const [broadcastSlides, setBroadcastSlides] = useState([{ title: '', text: '', image: '' }])
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcast[]>([])
  const [editingBroadcast, setEditingBroadcast] = useState<string | null>(null)
  const [editSlides, setEditSlides] = useState<BroadcastSlide[]>([])
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showEditPreview, setShowEditPreview] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rateLimitRes, statsRes] = await Promise.all([
        fetch('/api/rate-limit-status'),
        fetch('/api/stats'),
      ])

      if (!rateLimitRes.ok) {
        const json = await rateLimitRes.json()
        throw new Error(json.error || 'Failed to fetch rate limit status')
      }
      if (!statsRes.ok) {
        const json = await statsRes.json()
        throw new Error(json.error || 'Failed to fetch stats')
      }

      const rateLimitData = await rateLimitRes.json()
      const statsData = await statsRes.json()

      setData(rateLimitData)
      setStats(statsData)
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
        const json = await res.json()
        throw new Error(json.error || 'Failed to fetch past broadcasts')
      }
      const data = await res.json()
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
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Broadcast failed')
      toast.success(json.message)
      setBroadcastSlides([{ title: '', text: '', image: '' }]) // Reset form
      fetchPastBroadcasts() // Refresh past broadcasts
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
        body: JSON.stringify({ 
          id: editingBroadcast,
          slides: editSlides 
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update broadcast')
      toast.success('Broadcast updated successfully')
      setEditingBroadcast(null)
      setEditSlides([])
      fetchPastBroadcasts() // Refresh past broadcasts
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
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete broadcast')
      toast.success('Broadcast deleted successfully')
      fetchPastBroadcasts() // Refresh past broadcasts
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
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      toast.success(json.message)
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

  return (
    <div className="flex flex-col h-screen bg-transparent text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-black/20 backdrop-blur-sm border-b border-border/50">
        <div className="container mx-auto px-4 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="py-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">rate limit management</h1>
                <p className="text-muted-foreground mt-1">
                  monitor and manage API rate limiting and system health
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSensitiveData(!showSensitiveData)}
                  className="gap-2"
                >
                  {showSensitiveData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showSensitiveData ? 'Hide' : 'Show'} Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={cn('gap-2', autoRefresh && 'bg-primary/10 text-primary')}
                >
                  {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  auto refresh
                </Button>
                <Button onClick={fetchData} disabled={loading} size="sm" className="gap-2">
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  load data
                </Button>
              </div>
            </div>
            {lastUpdate && (
              <div className="mt-4 text-sm text-muted-foreground">
                last updated: {lastUpdate.toLocaleString()}
              </div>
            )}
          </motion.div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto px-4 max-w-7xl py-6">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
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
                {/* System Health */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Shield className="w-5 h-5" /> system health
                      </div>
                      <div className="text-sm text-muted-foreground">
                        overall system status and configuration validation
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Database
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.healthCheck.redis === 'Connected'
                              ? 'text-green-500'
                              : 'text-yellow-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Redis</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.healthCheck.redis}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Key
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.healthCheck.apiKeys === 'Available'
                              ? 'text-green-500'
                              : 'text-red-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">API Keys</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.environment.summary.apiKeys.totalAvailable}/
                            {data.configuration.apiKeys.keyCount} available
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Server
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.environment.validation.isValid
                              ? 'text-green-500'
                              : 'text-yellow-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Environment</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.environment.validation.isValid ? 'Valid' : 'Issues Found'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Settings className="w-5 h-5 flex-shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Status</p>
                          <p className="text-xs md:text-sm text-muted-foreground">{data.status}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Broadcast Dialog */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Send className="w-5 h-5" /> broadcast dialog
                      </div>
                      <div className="text-sm text-muted-foreground">
                        send a dialog to all connected users in real-time
                      </div>
                    </div>

                    <div className="space-y-4">
                      {broadcastSlides.map((slide, index) => (
                        <div
                          key={index}
                          className="p-4 rounded-lg bg-black/20 border border-border/20 relative space-y-3"
                        >
                          <h4 className="font-medium">Slide {index + 1}</h4>
                          <input
                            type="text"
                            placeholder="Title"
                            value={slide.title}
                            onChange={e => handleSlideChange(index, 'title', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <textarea
                            placeholder="Text content"
                            value={slide.text}
                            onChange={e => handleSlideChange(index, 'text', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                          />
                          <input
                            type="text"
                            placeholder="Image URL"
                            value={slide.image}
                            onChange={e => handleSlideChange(index, 'image', e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {broadcastSlides.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSlide(index)}
                              className="absolute top-2 right-2 w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex justify-between items-center">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={addSlide} className="gap-2">
                          <Plus className="w-4 h-4" /> Add Slide
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowPreview(true)}
                          className="gap-2"
                          disabled={!broadcastSlides.some(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())}
                        >
                          <Eye className="w-4 h-4" /> Preview
                        </Button>
                      </div>
                      <Button
                        onClick={handleSendBroadcast}
                        disabled={loading}
                        className="gap-2 bg-purple-600 hover:bg-purple-700"
                      >
                        <Send className="w-4 h-4" /> Send Broadcast
                      </Button>
                    </div>
                  </div>
                </motion.div>

                {/* Past Broadcasts Management */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <History className="w-5 h-5" /> Past Broadcasts
                      </div>
                      <div className="text-sm text-muted-foreground">
                        View, edit, and manage previously sent broadcasts
                      </div>
                    </div>

                    {loadingBroadcasts ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Loading past broadcasts...
                        </div>
                      </div>
                    ) : pastBroadcasts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No past broadcasts found.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pastBroadcasts.map((broadcast) => (
                          <div
                            key={broadcast.id}
                            className="border border-border/20 rounded-lg bg-black/20 p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Calendar className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-medium">
                                    {new Date(broadcast.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Sent by: {broadcast.sentBy}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditBroadcast(broadcast)}
                                  disabled={editingBroadcast === broadcast.id}
                                  className="gap-1"
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteBroadcast(broadcast.id)}
                                  disabled={loading}
                                  className="gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>

                            {editingBroadcast === broadcast.id ? (
                              <div className="space-y-4 mt-4">
                                <div className="text-sm font-medium text-yellow-400 mb-2">
                                  Editing broadcast slides:
                                </div>
                                {editSlides.map((slide, index) => (
                                  <div
                                    key={index}
                                    className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 relative space-y-3"
                                  >
                                    <h5 className="font-medium text-sm">Edit Slide {index + 1}</h5>
                                    <input
                                      type="text"
                                      placeholder="Title"
                                      value={slide.title}
                                      onChange={(e) => handleEditSlideChange(index, 'title', e.target.value)}
                                      className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <textarea
                                      placeholder="Text content"
                                      value={slide.text}
                                      onChange={(e) => handleEditSlideChange(index, 'text', e.target.value)}
                                      className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Image URL"
                                      value={slide.image}
                                      onChange={(e) => handleEditSlideChange(index, 'image', e.target.value)}
                                      className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    {editSlides.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeEditSlide(index)}
                                        className="absolute top-2 right-2 w-6 h-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                <div className="flex justify-between items-center pt-2">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={addEditSlide}
                                      className="gap-1"
                                    >
                                      <Plus className="w-4 h-4" />
                                      Add Slide
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowEditPreview(true)}
                                      className="gap-1"
                                      disabled={!editSlides.some(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())}
                                    >
                                      <Eye className="w-4 h-4" />
                                      Preview
                                    </Button>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingBroadcast(null)
                                        setEditSlides([])
                                      }}
                                      disabled={loading}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={handleSaveEditedBroadcast}
                                      disabled={loading}
                                      size="sm"
                                      className="gap-1"
                                    >
                                      {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-4 h-4" />
                                      )}
                                      Save Changes
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="text-sm font-medium text-blue-400 mb-2">
                                  Broadcast slides ({broadcast.slides.length}):
                                </div>
                                {broadcast.slides.map((slide, index) => (
                                  <div
                                    key={index}
                                    className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        Slide {index + 1}
                                      </span>
                                    </div>
                                    {slide.title && (
                                      <div className="font-medium text-sm mb-1">{slide.title}</div>
                                    )}
                                    {slide.text && (
                                      <div className="text-sm text-muted-foreground mb-2">
                                        {slide.text}
                                      </div>
                                    )}
                                    {slide.image && (
                                      <div className="text-xs text-blue-400 truncate">
                                        Image: {slide.image}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* System Statistics */}
                {stats && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                      <div className="flex flex-col space-y-1.5 mb-6">
                        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                          <Database className="w-5 h-5" /> System Statistics
                        </div>
                        <div className="text-sm text-muted-foreground">
                          High-level overview of system activity
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                          <Users className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium text-sm md:text-base">Total Users</p>
                            <p className="text-2xl font-bold">{stats.totalUsers}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                          <Clock className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="font-medium text-sm md:text-base">Messages (30min)</p>
                            <p className="text-2xl font-bold">{stats.messagesInLast30Minutes}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6">
                        <h4 className="font-semibold mb-2">Tool Call Stats</h4>
                        <div className="space-y-2">
                          {stats.toolCallStats.length > 0 ? (
                            stats.toolCallStats.map(tool => (
                              <div
                                key={tool.toolName}
                                className="flex justify-between items-center text-sm p-2 rounded-md bg-black/20"
                              >
                                <span>{tool.toolName}</span>
                                <span className="font-bold">{tool.count}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No tool calls recorded yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* API Key Management */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Key className="w-5 h-5" /> API Key Management
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Configuration and usage status for API keys
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm md:text-base">Configuration</h4>
                        <div className="space-y-2 text-xs md:text-sm">
                          <div className="flex justify-between">
                            <span>Total Keys:</span>
                            <Badge variant="outline">{data.configuration.apiKeys.keyCount}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span>Rotation Enabled:</span>
                            <Badge
                              variant={
                                data.configuration.apiKeys.enableRotation ? 'default' : 'secondary'
                              }
                            >
                              {data.configuration.apiKeys.enableRotation ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span>Auto-rotate on Limit:</span>
                            <Badge
                              variant={
                                data.configuration.apiKeys.rotateOnRateLimit
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {data.configuration.apiKeys.rotateOnRateLimit ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm md:text-base">Rate Limits</h4>
                        <div className="space-y-2 text-xs md:text-sm">
                          <div className="flex justify-between">
                            <span>Per Minute:</span>
                            <Badge variant="outline">
                              {data.configuration.apiKeys.rateLimit.requestsPerMinute}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span>Per Hour:</span>
                            <Badge variant="outline">
                              {data.configuration.apiKeys.rateLimit.requestsPerHour}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {showSensitiveData && (
                      <div className="mt-6 space-y-4">
                        <h4 className="font-medium text-sm md:text-base">Individual Key Status</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(data.keyUsage)
                            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                            .map(([key, usage]) => {
                              const parts = key.split('_')
                              const provider = parts[0] || 'Unknown'
                              const keyIndex = parts.length > 2 ? parts.slice(2).join('_') : 'N/A'
                              const displayName = `${provider.charAt(0).toUpperCase() + provider.slice(1)} Key ${keyIndex}`

                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    'p-4 rounded-lg bg-black/20 border',
                                    usage.isRateLimited && 'border-red-500/80'
                                  )}
                                >
                                  <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-semibold">{displayName}</h4>
                                    <div className="flex gap-2">
                                      {/* {usage.isCurrent && (
                                        <Badge
                                          variant="outline"
                                          className="text-blue-400 border-blue-400/50"
                                        >
                                          Current
                                        </Badge>
                                      )} */}
                                      {usage.isRateLimited && (
                                        <Badge variant="destructive">Rate Limited</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    <div className="flex justify-between">
                                      <span>Requests</span>
                                      <span className="font-mono">{usage.requests}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Failures</span>
                                      <span className="font-mono">{usage.failures}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Last Used</span>
                                      <span className="font-mono">
                                        {formatTimestamp(usage.lastUsed)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Last Failed</span>
                                      <span className="font-mono">
                                        {formatTimestamp(usage.lastFailed)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* System Statistics
                {stats && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                      <div className="flex flex-col space-y-1.5 mb-6">
                        <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                          <Database className="w-5 h-5" /> System Statistics
                        </div>
                        <div className="text-sm text-muted-foreground">
                          High-level overview of system activity
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                          <Users className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium text-sm md:text-base">Total Users</p>
                            <p className="text-2xl font-bold">{stats.totalUsers}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                          <Clock className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="font-medium text-sm md:text-base">Messages (30min)</p>
                            <p className="text-2xl font-bold">{stats.messagesInLast30Minutes}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6">
                        <h4 className="font-semibold mb-2">Tool Call Stats</h4>
                        <div className="space-y-2">
                          {stats.toolCallStats.length > 0 ? (
                            stats.toolCallStats.map(tool => (
                              <div key={tool.toolName} className="flex justify-between items-center text-sm p-2 rounded-md bg-black/20">
                                <span>{tool.toolName}</span>
                                <span className="font-bold">{tool.count}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No tool calls recorded yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )} */}

                {/* User Rate Limiting */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Users className="w-5 h-5" /> User Rate Limiting
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Per-user request rate limiting configuration
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="font-medium text-sm md:text-base">Per Minute</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration.userRateLimit.requestsPerMinute} requests
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="font-medium text-sm md:text-base">Per Hour</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration.userRateLimit.requestsPerHour} requests
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm md:text-base">Per Day</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration.userRateLimit.requestsPerDay} requests
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Activity className="w-5 h-5" /> Management Actions
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Perform maintenance and administrative actions
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => handleAction('rotate')}
                        disabled={loading}
                        variant="outline"
                        className="gap-2 w-full sm:w-auto"
                      >
                        <RotateCcw className="w-4 h-4" /> Rotate API Key
                      </Button>
                      <Button
                        onClick={() => handleAction('reset')}
                        disabled={loading}
                        variant="outline"
                        className="gap-2 w-full sm:w-auto"
                      >
                        <RefreshCw className="w-4 h-4" /> Reset Rate Limits
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modals */}
      <BroadcastDialog
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        payload={{ 
          slides: broadcastSlides
            .filter(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())
            .length > 0 
            ? broadcastSlides.filter(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())
            : [{ title: 'Preview', text: 'No content to preview yet. Add a title, text, or image to see the preview.', image: '/onboarding-artwork/artwork1.png' }]
        }}
      />
      
      <BroadcastDialog
        isOpen={showEditPreview}
        onClose={() => setShowEditPreview(false)}
        payload={{ 
          slides: editSlides
            .filter(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())
            .length > 0 
            ? editSlides.filter(slide => slide.title.trim() || slide.text.trim() || slide.image.trim())
            : [{ title: 'Preview', text: 'No content to preview yet. Add a title, text, or image to see the preview.', image: '/onboarding-artwork/artwork1.png' }]
        }}
      />
    </div>
  )
}
