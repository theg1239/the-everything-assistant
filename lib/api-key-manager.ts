import { Redis } from '@upstash/redis'

export interface ApiKeyEntry {
  key: string
  provider?: string
  label?: string
}

export interface ApiKeyConfig {
  keys: Array<ApiKeyEntry | string>
  rateLimit: {
    requestsPerMinute: number
    requestsPerHour: number
    requestsPerDay: number
  }
  retryConfig: {
    maxRetries: number
    backoffMultiplier: number
    maxBackoffMs: number
  }
  enableRotation: boolean
  rotateOnRateLimit: boolean
  keyHealthCheckInterval: number
  banCooldownMs?: number
  primaryProvider?: string
}

export interface ApiKeyUsageSnapshot {
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
  provider?: string
}

export interface ApiKeySelectOptions {
  excludeIndices?: number[]
  allowedProviders?: string[]
  preferredProviders?: string[]
}

export interface ApiKeyExecuteOptions extends ApiKeySelectOptions {
  maxAttempts?: number
  banCooldownMs?: number
}

export class ApiKeyManagerError extends Error {
  code: string
  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.code = code
    this.name = 'ApiKeyManagerError'
    if (cause) {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}

const DEFAULT_BAN_COOLDOWN_MS = 5 * 60 * 1000

export class ApiKeyManager {
  private config: ApiKeyConfig
  private redis: Redis
  private currentKeyIndex = 0
  private keys: ApiKeyEntry[]
  private initPromise: Promise<void>

  constructor(config: ApiKeyConfig) {
    this.config = config

    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis configuration required for API key management')
    }

    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    this.keys = this.normalizeKeys(config.keys)
    this.initPromise = this.loadCurrentKeyIndex()
  }

  private normalizeKeys(keys: Array<ApiKeyEntry | string>): ApiKeyEntry[] {
    if (!Array.isArray(keys)) return []
    const normalized: ApiKeyEntry[] = []
    for (const raw of keys) {
      if (!raw) continue
      if (typeof raw === 'string') {
        if (!raw.trim()) continue
        normalized.push({ key: raw, provider: this.config.primaryProvider })
        continue
      }
      if (typeof raw.key !== 'string' || !raw.key.trim()) continue
      normalized.push({
        key: raw.key,
        provider: raw.provider || this.config.primaryProvider,
        label: raw.label,
      })
    }
    return normalized
  }

  private async loadCurrentKeyIndex(): Promise<void> {
    try {
      const stored = await this.redis.get('api_key_manager:current_index')
      if (stored) this.currentKeyIndex = parseInt(stored as string)
    } catch (err) {
      console.warn('Failed to load current key index from Redis:', err)
    }
  }

  private async saveCurrentKeyIndex(): Promise<void> {
    try {
      await this.redis.set('api_key_manager:current_index', this.currentKeyIndex.toString())
    } catch (err) {
      console.warn('Failed to save current key index to Redis:', err)
    }
  }

  private ensureReady = async () => {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  private hashKey(entry: ApiKeyEntry): string {
    if (!entry?.key || typeof entry.key !== 'string') {
      throw new Error('ApiKeyManager: Tried to hash an undefined or non-string key')
    }
    const provider = this.getEntryProvider(entry) || 'unknown'
    return `key_${provider}_${entry.key.slice(-8)}_${entry.key.length}`
  }

  private getBanKey(entry: ApiKeyEntry): string {
    return `ban:${this.hashKey(entry)}`
  }

  private getStatsKey(entry: ApiKeyEntry): string {
    return `stats:${this.hashKey(entry)}`
  }

  private async getBanStatuses(): Promise<boolean[]> {
    if (this.keys.length === 0) return []
    const banKeys = this.keys.map(entry => this.getBanKey(entry))
    try {
      const results = await this.redis.mget(...banKeys)
      return results.map(value => value !== null && value !== undefined)
    } catch (err) {
      console.warn('Failed to fetch ban statuses from Redis:', err)
      return banKeys.map(() => false)
    }
  }

  private normalizeExcludeIndices(excludeIndices?: number[]): Set<number> {
    const exclude = new Set<number>()
    if (!Array.isArray(excludeIndices)) return exclude
    for (const idx of excludeIndices) {
      if (Number.isInteger(idx) && idx >= 0 && idx < this.keys.length) {
        exclude.add(idx)
      }
    }
    return exclude
  }

  private getEntryProvider(entry?: ApiKeyEntry): string | undefined {
    return entry?.provider || this.config.primaryProvider
  }

  private filterAllowedIndices(
    exclude: Set<number>,
    banned: boolean[],
    allowedProviders?: string[]
  ): number[] {
    const allowedSet =
      Array.isArray(allowedProviders) && allowedProviders.length > 0
        ? new Set(allowedProviders)
        : null
    const indices: number[] = []
    for (let idx = 0; idx < this.keys.length; idx++) {
      if (exclude.has(idx)) continue
      if (banned[idx]) continue
      const provider = this.getEntryProvider(this.keys[idx])
      if (allowedSet && provider && !allowedSet.has(provider)) continue
      if (allowedSet && !provider) continue
      indices.push(idx)
    }
    return indices
  }

  private getProviderOrder(
    allowedProviders?: string[],
    preferredProviders?: string[]
  ): string[] {
    const allowedSet =
      Array.isArray(allowedProviders) && allowedProviders.length > 0
        ? new Set(allowedProviders)
        : null
    const providersInKeys = new Set<string>()
    for (const entry of this.keys) {
      const provider = this.getEntryProvider(entry)
      if (!provider) continue
      if (allowedSet && !allowedSet.has(provider)) continue
      providersInKeys.add(provider)
    }

    const ordered: string[] = []
    const pushUnique = (provider?: string) => {
      if (!provider) return
      if (!providersInKeys.has(provider)) return
      if (ordered.includes(provider)) return
      ordered.push(provider)
    }

    if (Array.isArray(preferredProviders) && preferredProviders.length > 0) {
      for (const provider of preferredProviders) {
        pushUnique(provider)
      }
    }

    for (const provider of providersInKeys) {
      pushUnique(provider)
    }

    return ordered
  }

  private hasAvailableProvider(
    provider: string,
    exclude: Set<number>,
    banned: boolean[],
    allowedProviders?: string[]
  ): boolean {
    const allowedSet =
      Array.isArray(allowedProviders) && allowedProviders.length > 0
        ? new Set(allowedProviders)
        : null
    if (allowedSet && !allowedSet.has(provider)) return false
    for (let idx = 0; idx < this.keys.length; idx++) {
      if (exclude.has(idx)) continue
      if (banned[idx]) continue
      const entryProvider = this.getEntryProvider(this.keys[idx])
      if (entryProvider === provider) return true
    }
    return false
  }

  private pickIndexByRotation(candidates: number[]): number {
    if (candidates.length === 1) return candidates[0]
    const candidateSet = new Set(candidates)
    const start = this.currentKeyIndex % this.keys.length
    for (let offset = 0; offset < this.keys.length; offset++) {
      const idx = (start + offset) % this.keys.length
      if (candidateSet.has(idx)) return idx
    }
    return candidates[0]
  }

  private async selectKey(
    options: ApiKeySelectOptions = {},
    banned?: boolean[]
  ): Promise<{ entry: ApiKeyEntry; index: number } | null> {
    await this.ensureReady()
    if (!this.keys.length) return null
    const exclude = this.normalizeExcludeIndices(options.excludeIndices)
    const banStatuses = banned ?? (await this.getBanStatuses())
    const availableIndices = this.filterAllowedIndices(
      exclude,
      banStatuses,
      options.allowedProviders
    )
    if (availableIndices.length === 0) return null

    let candidateIndices = availableIndices
    if (options.preferredProviders?.length) {
      for (const provider of options.preferredProviders) {
        const providerIndices = availableIndices.filter(
          idx => this.getEntryProvider(this.keys[idx]) === provider
        )
        if (providerIndices.length > 0) {
          candidateIndices = providerIndices
          break
        }
      }
    }

    const selectedIdx = this.pickIndexByRotation(candidateIndices)
    this.currentKeyIndex = (selectedIdx + 1) % this.keys.length
    await this.saveCurrentKeyIndex()
    return { entry: this.keys[selectedIdx], index: selectedIdx }
  }

  async getCurrentKey(options: ApiKeySelectOptions = {}): Promise<ApiKeyEntry> {
    const selection = await this.selectKey(options)
    if (!selection) {
      throw new ApiKeyManagerError('NO_AVAILABLE_KEYS', 'No available API keys')
    }
    return selection.entry
  }

  private async recordKeyUsage(entry: ApiKeyEntry): Promise<void> {
    const statsKey = this.getStatsKey(entry)
    const now = Date.now()
    const raw = await this.redis.hgetall(statsKey)
    const stored = raw ?? {}
    const prevCount = parseInt(stored.requests as string) || 0
    await this.redis.hset(statsKey, {
      requests: prevCount + 1,
      lastUsed: now,
    })
    await this.redis.expire(statsKey, 86400 * 30)
  }

  private async recordKeyFailure(entry: ApiKeyEntry): Promise<void> {
    const statsKey = this.getStatsKey(entry)
    const ts = Date.now()
    const raw = await this.redis.hgetall(statsKey)
    const stored = raw ?? {}
    const prevFails = parseInt(stored.failures as string) || 0
    await this.redis.hset(statsKey, {
      failures: prevFails + 1,
      lastFailed: ts,
    })
    await this.redis.expire(statsKey, 86400 * 30)
  }

  private async banEntry(entry: ApiKeyEntry, cooldownMs?: number): Promise<void> {
    const cooldown = Math.max(1000, cooldownMs ?? this.config.banCooldownMs ?? DEFAULT_BAN_COOLDOWN_MS)
    const until = Date.now() + cooldown
    await this.redis.set(this.getBanKey(entry), until.toString(), {
      ex: Math.ceil(cooldown / 1000),
    })
  }

  async banKeyByIndex(index: number, cooldownMs?: number): Promise<void> {
    if (!Number.isInteger(index) || index < 0 || index >= this.keys.length) return
    await this.banEntry(this.keys[index], cooldownMs)
  }

  async executeWithRateLimit<T>(
    apiCall: (entry: ApiKeyEntry, index: number) => Promise<T>,
    options: ApiKeyExecuteOptions = {}
  ): Promise<T> {
    await this.ensureReady()
    if (!this.keys.length) {
      throw new ApiKeyManagerError('NO_API_KEYS', 'No API keys configured for ApiKeyManager')
    }

    const exclude = this.normalizeExcludeIndices(options.excludeIndices)
    const banStatuses = await this.getBanStatuses()
    const defaultMaxAttempts = Math.max(1, this.config.retryConfig.maxRetries || 1)
    const providerOrder = this.getProviderOrder(options.allowedProviders, options.preferredProviders)

    let lastErr: any = null

    while (providerOrder.length > 0) {
      const activeProvider = providerOrder[0]
      if (!this.hasAvailableProvider(activeProvider, exclude, banStatuses, options.allowedProviders)) {
        providerOrder.shift()
        continue
      }

      const maxAttemptsForProvider =
        typeof options.maxAttempts === 'number'
          ? Math.max(1, Math.min(options.maxAttempts, this.keys.length))
          : Math.min(defaultMaxAttempts, this.keys.length)
      let attemptsForProvider = 0

      while (attemptsForProvider < maxAttemptsForProvider) {
        const selection = await this.selectKey(
          {
            excludeIndices: [...exclude],
            allowedProviders: [activeProvider],
            preferredProviders: [activeProvider],
          },
          banStatuses
        )
        if (!selection) break

        const { entry, index } = selection
        exclude.add(index)

        try {
          const result = await apiCall(entry, index)
          await this.recordKeyUsage(entry)
          return result
        } catch (err: any) {
          lastErr = err
          console.error(`[ApiKeyManager] Error for key ${this.hashKey(entry)}:`, err?.message || err)
          await this.recordKeyFailure(entry)
          await this.banEntry(entry, options.banCooldownMs)
          banStatuses[index] = true
          attemptsForProvider++
        }
      }
      providerOrder.shift()
    }

    throw new ApiKeyManagerError(
      'ALL_KEYS_EXHAUSTED',
      `All API keys failed or are temporarily banned. Last error: ${lastErr?.message || 'Unknown'}`,
      lastErr
    )
  }

  async getKeyUsageStats(): Promise<Record<string, ApiKeyUsageSnapshot>> {
    const stats: Record<string, ApiKeyUsageSnapshot> = {}
    const banStatuses = await this.getBanStatuses()

    for (const [idx, entry] of this.keys.entries()) {
      const raw = await this.redis.hgetall(this.getStatsKey(entry))
      const stored = raw ?? {}
      const requests = parseInt(stored.requests as string) || 0
      const failures = parseInt(stored.failures as string) || 0
      const lastUsed = stored.lastUsed ? parseInt(stored.lastUsed as string) : null
      const lastFailed = stored.lastFailed ? parseInt(stored.lastFailed as string) : null
      const isRateLimited = banStatuses[idx]
      const isCurrent = idx === this.currentKeyIndex

      stats[`key_${idx}`] = {
        requests,
        failures,
        lastUsed,
        lastFailed,
        availableTokens: {
          minute: isRateLimited ? 0 : this.config.rateLimit.requestsPerMinute,
          hour: isRateLimited ? 0 : this.config.rateLimit.requestsPerHour,
          day: isRateLimited ? 0 : this.config.rateLimit.requestsPerDay,
        },
        isRateLimited,
        isCurrent,
        provider: entry.provider,
      }
    }
    return stats
  }

  async rotateToNextKey(): Promise<void> {
    if (!this.config.enableRotation) {
      throw new Error('Key rotation is disabled')
    }
    if (!this.keys.length) {
      throw new Error('No API keys configured for ApiKeyManager')
    }
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length
    await this.saveCurrentKeyIndex()
    console.log(`Manually rotated to API key index ${this.currentKeyIndex}`)
  }

  async resetAllRateLimits(): Promise<void> {
    for (const entry of this.keys) {
      await this.redis.del(this.getBanKey(entry))
    }
    console.log('All API key bans have been reset')
  }
}

export const DEFAULT_API_KEY_CONFIG: ApiKeyConfig = {
  keys: [],
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 50000,
  },
  retryConfig: {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffMs: 30000,
  },
  enableRotation: true,
  rotateOnRateLimit: true,
  keyHealthCheckInterval: 30000,
  banCooldownMs: DEFAULT_BAN_COOLDOWN_MS,
}
