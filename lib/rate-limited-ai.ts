import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'
import { UserRateLimiter, UserRateLimitConfig, loadUserRateLimitConfig } from './user-rate-limiter'
import { streamText, generateObject, generateText, embed } from 'ai'
import { groq } from '@ai-sdk/groq';

export class RateLimitedGoogleAI {
  private apiKeyManager: ApiKeyManager
  private userRateLimiter: UserRateLimiter
  private config: ApiKeyConfig
  private userConfig: UserRateLimitConfig

  constructor(
    customConfig?: Partial<ApiKeyConfig>,
    customUserConfig?: Partial<UserRateLimitConfig>
  ) {
    const apiKeys = this.loadApiKeysFromEnvironment()

    this.config = {
      ...DEFAULT_API_KEY_CONFIG,
      ...customConfig,
      keys: apiKeys,
    }

    this.userConfig = {
      ...loadUserRateLimitConfig(),
      ...customUserConfig,
    }

    this.apiKeyManager = new ApiKeyManager(this.config)
    this.userRateLimiter = new UserRateLimiter(this.userConfig)
  }

  private loadApiKeysFromEnvironment(): string[] {
    const keys: string[] = []

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      keys.push(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    }

    for (let i = 2; i <= 10; i++) {
      const key = process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`]
      if (key) {
        keys.push(key)
      }
    }

    if (keys.length === 0 && process.env.GOOGLE_AI_API_KEYS) {
      const multipleKeys = process.env.GOOGLE_AI_API_KEYS.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
      keys.push(...multipleKeys)
    }

    if (keys.length === 0) {
      throw new Error(
        'No Google AI API keys found in environment variables. Please set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_AI_API_KEYS.'
      )
    }

    console.log(`Loaded ${keys.length} Google AI API key(s) for rotation`)
    return keys
  }

  private createGoogleInstance(apiKey: string) {
    return createGoogleGenerativeAI({ apiKey })
  }

  getModel(modelName: string = 'gemini-2.5-flash-lite-preview-06-17') {
    return async () => {
      const apiKey = await this.apiKeyManager.getCurrentKey()
      const google = this.createGoogleInstance(apiKey)
      return google(modelName)
    }
  }

  getEmbeddingModel(modelName: string = 'text-embedding-004') {
    return async () => {
      const apiKey = await this.apiKeyManager.getCurrentKey()
      const google = this.createGoogleInstance(apiKey)
      return google.embedding(modelName)
    }
  }
  async streamText(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const userCheck = await this.userRateLimiter.checkRateLimit(userId)
      if (!userCheck.allowed) {
        throw new Error(`User rate limit exceeded: ${userCheck.error}`)
      }
    }

    return this.executeWithRateLimit(async (apiKey: string) => {
      const google = this.createGoogleInstance(apiKey)
      const modelName = options.model?.modelId || 'gemini-2.5-flash-lite-preview-06-17'

      return streamText({
        ...options,
        model: google(modelName),
      })
    })
  }

  async generateText(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const userCheck = await this.userRateLimiter.checkRateLimit(userId)
      if (!userCheck.allowed) {
        throw new Error(`User rate limit exceeded: ${userCheck.error}`)
      }
    }

    return this.executeWithRateLimit(async (apiKey: string) => {
      const google = this.createGoogleInstance(apiKey)
      const modelName = options.model?.modelId || 'gemini-2.5-flash-lite-preview-06-17'

      return generateText({
        ...options,
        model: google(modelName),
      })
    })
  }

  async generateObject(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const userCheck = await this.userRateLimiter.checkRateLimit(userId)
      if (!userCheck.allowed) {
        throw new Error(`User rate limit exceeded: ${userCheck.error}`)
      }
    }

    return this.executeWithRateLimit(async (apiKey: string) => {
      const google = this.createGoogleInstance(apiKey)
      const modelName = options.model?.modelId || 'gemini-2.5-flash-lite-preview-06-17'

      return generateObject({
        ...options,
        model: google(modelName),
      })
    })
  }

  async embed(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const userCheck = await this.userRateLimiter.checkRateLimit(userId)
      if (!userCheck.allowed) {
        throw new Error(`User rate limit exceeded: ${userCheck.error}`)
      }
    }

    return this.executeWithRateLimit(async (apiKey: string) => {
      const google = this.createGoogleInstance(apiKey)
      const modelName = options.model?.modelId || 'text-embedding-004'

      return embed({
        ...options,
        model: google.embedding(modelName),
      })
    })
  }

  private async executeWithRateLimit<T>(apiCall: (apiKey: string) => Promise<T>): Promise<T> {
    return this.apiKeyManager.executeWithRateLimit(apiCall)
  }

  async getUsageStats() {
    return this.apiKeyManager.getKeyUsageStats()
  }

  async rotateKey() {
    return this.apiKeyManager.rotateToNextKey()
  }

  async resetRateLimits() {
    return this.apiKeyManager.resetAllRateLimits()
  }

  getConfig() {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<ApiKeyConfig>) {
    this.config = { ...this.config, ...newConfig }
    this.apiKeyManager = new ApiKeyManager(this.config)
  }

  async getUserUsageStats(userId: string) {
    return this.userRateLimiter.getUserUsageStats(userId)
  }

  async checkUserRateLimit(userId: string) {
    return this.userRateLimiter.checkRateLimit(userId)
  }

  async resetUserRateLimits(userId: string) {
    return this.userRateLimiter.resetUserLimits(userId)
  }

  getUserConfig() {
    return { ...this.userConfig }
  }

  updateUserConfig(newConfig: Partial<UserRateLimitConfig>) {
    this.userConfig = { ...this.userConfig, ...newConfig }
    this.userRateLimiter.updateConfig(newConfig)
  }

  async getFullStatus(userId?: string) {
    const apiKeyStats = await this.getUsageStats()
    const userStats = userId ? await this.getUserUsageStats(userId) : null

    return {
      apiKeys: {
        stats: apiKeyStats,
        config: this.getConfig(),
      },
      userRateLimit: {
        stats: userStats,
        config: this.getUserConfig(),
        enabled: this.userConfig.enabled,
      },
    }
  }
}

let globalRateLimitedGoogle: RateLimitedGoogleAI | null = null

export function getRateLimitedGoogle(config?: Partial<ApiKeyConfig>): RateLimitedGoogleAI {
  if (!globalRateLimitedGoogle) {
    globalRateLimitedGoogle = new RateLimitedGoogleAI(config)
  }
  return globalRateLimitedGoogle
}

export async function getGoogleModel(modelName: string = 'gemini-2.5-flash-lite-preview-06-17') {
  const instance = getRateLimitedGoogle()
  const googleFactory = await instance.getModel(modelName)
  return googleFactory()
}

export async function getGoogleEmbeddingModel(modelName: string = 'text-embedding-004') {
  const instance = getRateLimitedGoogle()
  const embeddingFactory = await instance.getEmbeddingModel(modelName)
  return embeddingFactory()
}

export const rateLimitedGoogle = {
  model: async (modelName: string = 'gemini-2.5-flash-lite-preview-06-17') =>
    getGoogleModel(modelName),

  embedding: async (modelName: string = 'text-embedding-004') => getGoogleEmbeddingModel(modelName),

  streamText: (options: any, userId?: string) => getRateLimitedGoogle().streamText(options, userId),
  generateText: (options: any, userId?: string) =>
    getRateLimitedGoogle().generateText(options, userId),
  generateObject: (options: any, userId?: string) =>
    getRateLimitedGoogle().generateObject(options, userId),
  embed: (options: any, userId?: string) => getRateLimitedGoogle().embed(options, userId),

  getUsageStats: () => getRateLimitedGoogle().getUsageStats(),
  rotateKey: () => getRateLimitedGoogle().rotateKey(),
  resetRateLimits: () => getRateLimitedGoogle().resetRateLimits(),
  updateConfig: (config: Partial<ApiKeyConfig>) => getRateLimitedGoogle().updateConfig(config),

  getUserUsageStats: (userId: string) => getRateLimitedGoogle().getUserUsageStats(userId),
  checkUserRateLimit: (userId: string) => getRateLimitedGoogle().checkUserRateLimit(userId),
  resetUserRateLimits: (userId: string) => getRateLimitedGoogle().resetUserRateLimits(userId),
  getUserConfig: () => getRateLimitedGoogle().getUserConfig(),
  updateUserConfig: (config: any) => getRateLimitedGoogle().updateUserConfig(config),
  getFullStatus: (userId?: string) => getRateLimitedGoogle().getFullStatus(userId),
}

export default rateLimitedGoogle

export type { ApiKeyConfig }
