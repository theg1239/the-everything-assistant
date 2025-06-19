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
        totalConfigured: number
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
      requestCount: number
      lastUsed: string | null
      isHealthy: boolean
      consecutiveFailures: number
      rateLimitedUntil: string | null
    }
  }
  healthCheck: {
    redis: string
    apiKeys: string
  }
}

export default function ManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [data, setData] = useState<RateLimitStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [showSensitiveData, setShowSensitiveData] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/rate-limit-status')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch rate limit status')
      }

      setData(result)
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

    if (status === 'authenticated') {
      fetchData()
    }
  }, [status, router, fetchData])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchData()
    }, 10000)

    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const handleAction = async (action: string, config?: any) => {
    setLoading(true)

    try {
      const response = await fetch('/api/rate-limit-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, config }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to execute action')
      }

      toast.success(result.message)

      // Refresh data after action
      await fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute action')
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleString()
  }

  const getStatusColor = (isHealthy: boolean) => {
    return isHealthy ? 'text-green-500' : 'text-red-500'
  }

  const getStatusIcon = (isHealthy: boolean) => {
    return isHealthy ? CheckCircle : XCircle
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col h-screen bg-transparent">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-transparent text-foreground overflow-hidden">
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
                <h1 className="text-3xl font-bold text-foreground">rate limit management</h1>
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

            {loading && !data && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center py-12"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>loading rate limit status...</span>
                </div>
              </motion.div>
            )}

            {data && (
              <div className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Shield className="w-5 h-5" />
                        system health
                      </div>
                      <div className="text-sm text-muted-foreground">
                        overall system status and configuration validation
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {' '}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Database
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.healthCheck?.redis === 'Connected'
                              ? 'text-green-500'
                              : 'text-yellow-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Redis</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.healthCheck?.redis || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Key
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.healthCheck?.apiKeys === 'Available'
                              ? 'text-green-500'
                              : 'text-red-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">API Keys</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.environment?.summary?.apiKeys
                              ? `${data.environment.summary.apiKeys.totalAvailable}/${data.environment.summary.apiKeys.totalConfigured} available`
                              : 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Server
                          className={cn(
                            'w-5 h-5 flex-shrink-0',
                            data.environment?.validation?.isValid
                              ? 'text-green-500'
                              : 'text-yellow-500'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Environment</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.environment?.validation?.isValid ? 'Valid' : 'Issues Found'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Settings className="w-5 h-5 flex-shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Status</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.status || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Validation Errors/Warnings */}
                    {(!data.environment?.validation?.isValid ||
                      (data.environment?.validation?.warnings &&
                        data.environment.validation.warnings.length > 0)) && (
                      <div className="mt-6 space-y-3">
                        {data.environment?.validation?.errors &&
                          data.environment.validation.errors.length > 0 && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                              <div className="flex items-center gap-2 mb-2 text-destructive">
                                <XCircle className="w-4 h-4" />
                                <span className="font-medium text-sm">Configuration Errors</span>
                              </div>
                              <ul className="text-xs space-y-1 text-destructive/80">
                                {data.environment.validation.errors.map((error, index) => (
                                  <li key={index}>• {error}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {data.environment?.validation?.warnings &&
                          data.environment.validation.warnings.length > 0 && (
                            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                              <div className="flex items-center gap-2 mb-2 text-yellow-500">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="font-medium text-sm">Configuration Warnings</span>
                              </div>
                              <ul className="text-xs space-y-1 text-yellow-500/80">
                                {data.environment.validation.warnings.map((warning, index) => (
                                  <li key={index}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* API Keys Management */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Key className="w-5 h-5" />
                        API Key Management
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Configuration and usage status for API keys
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm md:text-base">Configuration</h4>{' '}
                        <div className="space-y-2 text-xs md:text-sm">
                          <div className="flex justify-between items-center">
                            <span>Total Keys:</span>
                            <Badge variant="outline">
                              {data.configuration?.apiKeys?.keyCount || 0}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Rotation Enabled:</span>
                            <Badge
                              variant={
                                data.configuration?.apiKeys?.enableRotation
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {data.configuration?.apiKeys?.enableRotation ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Auto-rotate on Limit:</span>
                            <Badge
                              variant={
                                data.configuration?.apiKeys?.rotateOnRateLimit
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {data.configuration?.apiKeys?.rotateOnRateLimit ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-medium text-sm md:text-base">Rate Limits</h4>{' '}
                        <div className="space-y-2 text-xs md:text-sm">
                          <div className="flex justify-between items-center">
                            <span>Per Minute:</span>
                            <Badge variant="outline">
                              {data.configuration?.apiKeys?.rateLimit?.requestsPerMinute || 0}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Per Hour:</span>
                            <Badge variant="outline">
                              {data.configuration?.apiKeys?.rateLimit?.requestsPerHour || 0}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    {showSensitiveData && data.keyUsage && (
                      <div className="mt-6 space-y-4">
                        <h4 className="font-medium text-sm md:text-base">Individual Key Status</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(data.keyUsage).map(([keyIndex, usage]) => {
                            const StatusIcon = getStatusIcon(usage?.isHealthy || false)
                            return (
                              <div
                                key={keyIndex}
                                className="p-4 rounded-lg bg-black/20 border border-border/20"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="font-medium text-sm md:text-base">
                                    Key {keyIndex}
                                  </h5>
                                  <StatusIcon
                                    className={cn(
                                      'w-4 h-4 flex-shrink-0',
                                      getStatusColor(usage?.isHealthy || false)
                                    )}
                                  />
                                </div>
                                <div className="space-y-2 text-xs md:text-sm">
                                  <div className="flex justify-between items-center">
                                    <span>Requests:</span>
                                    <span>{usage?.requestCount || 0}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>Last Used:</span>
                                    <span className="text-xs truncate max-w-[100px]">
                                      {formatTimestamp(usage?.lastUsed)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span>Failures:</span>
                                    <Badge
                                      variant={
                                        (usage?.consecutiveFailures || 0) > 0
                                          ? 'destructive'
                                          : 'secondary'
                                      }
                                    >
                                      {usage?.consecutiveFailures || 0}
                                    </Badge>
                                  </div>
                                  {usage?.rateLimitedUntil && (
                                    <div className="flex justify-between items-center">
                                      <span>Limited Until:</span>
                                      <span className="text-xs text-orange-500 truncate max-w-[100px]">
                                        {formatTimestamp(usage.rateLimitedUntil)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* User Rate Limiting */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="rounded-lg bg-black/20 backdrop-blur-sm border border-border/30 p-6">
                    <div className="flex flex-col space-y-1.5 mb-6">
                      <div className="flex items-center gap-2 text-lg md:text-xl font-semibold">
                        <Users className="w-5 h-5" />
                        User Rate Limiting
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Per-user request rate limiting configuration
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {' '}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 flex-shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Per Minute</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration?.userRateLimit?.requestsPerMinute || 0} requests
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 flex-shrink-0 text-green-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Per Hour</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration?.userRateLimit?.requestsPerHour || 0} requests
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-border/20">
                        <Clock className="w-5 h-5 flex-shrink-0 text-orange-500" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm md:text-base">Per Day</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {data.configuration?.userRateLimit?.requestsPerDay || 0} requests
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
                        <Activity className="w-5 h-5" />
                        Management Actions
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
                        <RotateCcw className="w-4 h-4" />
                        Rotate API Key
                      </Button>

                      <Button
                        onClick={() => handleAction('reset')}
                        disabled={loading}
                        variant="outline"
                        className="gap-2 w-full sm:w-auto"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Reset Rate Limits
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
