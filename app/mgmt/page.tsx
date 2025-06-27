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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  totalUsers: number;
  messagesInLast30Minutes: number;
  toolCallStats: {
    toolName: string;
    count: number;
  }[];
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=%2Fmgmt')
      return
    }
    if (status === 'authenticated') fetchData()
  }, [status, router, fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(fetchData, 10000)
    return () => clearInterval(iv)
  }, [autoRefresh, fetchData])

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

                {/* System Statistics */}
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
                )}

                {/* API Key Management */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
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
                              const parts = key.split('_');
                              const provider = parts[0] || 'Unknown';
                              const keyIndex = parts.length > 2 ? parts.slice(2).join('_') : 'N/A';
                              const displayName = `${provider.charAt(0).toUpperCase() + provider.slice(1)} Key ${keyIndex}`;

                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    'p-4 rounded-lg bg-black/20 border',
                                    usage.isRateLimited && 'border-red-500/80'
                                  )}
                                >
                                  <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-semibold">
                                      {displayName}
                                    </h4>
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
                  transition={{ delay: 0.3 }}
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
                  transition={{ delay: 0.4 }}
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
    </div>
  )
}
