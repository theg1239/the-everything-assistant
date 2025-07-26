import { createGoogleGenerativeAI } from '@ai-sdk/google' // Google provider
import { createGroq } from '@ai-sdk/groq' // Groq provider
import { cerebras, createCerebras } from '@ai-sdk/cerebras' // Cerebras provider
import { ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'
import { UserRateLimiter, UserRateLimitConfig, loadUserRateLimitConfig } from './user-rate-limiter'
import {
  streamText,
  generateText,
  generateObject,
  embed,
  embedMany,
  type EmbedResult,
  type EmbedManyResult,
} from 'ai'
import type { EmbeddingModel } from 'ai'

type Provider = 'google' | 'groq' | 'cerebras'

export class RateLimitedAI {
  private apiKeyManager: ApiKeyManager
  private userRateLimiter: UserRateLimiter
  private config: ApiKeyConfig
  private userConfig: UserRateLimitConfig
  private provider: Provider

  constructor(
    provider: Provider,
    customConfig?: Partial<ApiKeyConfig>,
    customUserConfig?: Partial<UserRateLimitConfig>
  ) {
    this.provider = provider

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

    if (this.provider === 'google') {
      if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        keys.push(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      }
      for (let i = 2; i <= 10; i++) {
        const k = process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`]
        if (k) keys.push(k)
      }
      if (keys.length === 0 && process.env.GOOGLE_AI_API_KEYS) {
        keys.push(
          ...process.env.GOOGLE_AI_API_KEYS.split(',')
            .map(x => x.trim())
            .filter(Boolean)
        )
      }
      if (keys.length === 0) {
        throw new Error(
          'No Google AI API keys found. Please set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_AI_API_KEYS.'
        )
      }
    } else {
      if (process.env.GROQ_API_KEY) {
        keys.push(process.env.GROQ_API_KEY)
      }
      for (let i = 2; i <= 10; i++) {
        const k = process.env[`GROQ_API_KEY_${i}`]
        if (k) keys.push(k)
      }
      if (keys.length === 0 && process.env.GROQ_API_KEYS) {
        keys.push(
          ...process.env.GROQ_API_KEYS.split(',')
            .map(x => x.trim())
            .filter(Boolean)
        )
      }
      if (keys.length === 0) {
        throw new Error('No Groq API keys found. Please set GROQ_API_KEY or GROQ_API_KEYS.')
      }
      if (this.provider === 'cerebras') {
        if (process.env.CEREBRAS_API_KEY) {
          keys.push(process.env.CEREBRAS_API_KEY)
        }
        for (let i = 2; i <= 10; i++) {
          const k = process.env[`CEREBRAS_API_KEY_${i}`]
          if (k) keys.push(k)
        }
        if (keys.length === 0 && process.env.CEREBRAS_API_KEYS) {
          keys.push(
            ...process.env.CEREBRAS_API_KEYS.split(',')
              .map(x => x.trim())
              .filter(Boolean)
          )
        }
        if (keys.length === 0) {
          throw new Error(
            'No Cerebras API keys found. Please set CEREBRAS_API_KEY or CEREBRAS_API_KEYS.'
          )
        }
      }
    }

    console.log(`Loaded ${keys.length} ${this.provider} API key(s)`)
    return keys
  }

  private createProviderInstance(apiKey: string) {
    if (this.provider === 'google') {
      return createGoogleGenerativeAI({ apiKey })
    }
    if (this.provider === 'groq') {
      return createGroq({ apiKey })
    }
    return createCerebras({ apiKey })
  }

  getModel(modelName: string) {
    return async () => {
      const key = await this.apiKeyManager.getCurrentKey()
      const provider = this.createProviderInstance(key)
      return provider(modelName)
    }
  }

  getEmbeddingModel(
    modelName: string = 'text-embedding-004'
  ): () => Promise<EmbeddingModel<string>> {
    return async () => {
      const key = await this.apiKeyManager.getCurrentKey()
      const google = createGoogleGenerativeAI({ apiKey: key })
      return google.embedding(modelName)
    }
  }

  async streamText(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
    return this.apiKeyManager.executeWithRateLimit(async key => {
      const provider = this.createProviderInstance(key)
      const modelFn = provider(options.model?.modelId)
      return streamText({ ...options, model: modelFn })
    })
  }

  async generateText(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
    return this.apiKeyManager.executeWithRateLimit(async key => {
      const provider = this.createProviderInstance(key)
      const modelFn = provider(options.model?.modelId)
      return generateText({ ...options, model: modelFn })
    })
  }

  async generateObject(options: any, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
    return this.apiKeyManager.executeWithRateLimit(async key => {
      const provider = this.createProviderInstance(key)
      const modelFn = provider(options.model?.modelId)
      return generateObject({ ...options, model: modelFn })
    })
  }

  /**
   * SINGLE‐VALUE embedding overload
   */
  async embed(
    options: { model?: { modelId: string }; value: string },
    userId?: string
  ): Promise<EmbedResult<string>>

  async embed(
    options: { model?: { modelId: string }; values: string[] },
    userId?: string
  ): Promise<EmbedManyResult<string>>

  async embed(
    options: {
      model?: { modelId: string }
      value?: string
      values?: string[]
    },
    userId?: string
  ): Promise<EmbedResult<string> | EmbedManyResult<string>> {
    return this.apiKeyManager.executeWithRateLimit(async key => {
      const google = createGoogleGenerativeAI({ apiKey: key })
      const modelFn = google.embedding(options.model?.modelId || 'text-embedding-004')

      if (Array.isArray(options.values)) {
        return embedMany({
          model: modelFn,
          values: options.values,
        })
      } else {
        return embed({
          model: modelFn,
          value: options.value ?? '',
        })
      }
    })
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

  updateConfig(c: Partial<ApiKeyConfig>) {
    this.config = { ...this.config, ...c }
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
  updateUserConfig(c: Partial<UserRateLimitConfig>) {
    this.userConfig = { ...this.userConfig, ...c }
    this.userRateLimiter.updateConfig(c)
  }

  async getFullStatus(userId?: string) {
    const apiKeys = await this.getUsageStats()
    const userStats = userId ? await this.getUserUsageStats(userId) : null
    return {
      apiKeys: { stats: apiKeys, config: this.getConfig() },
      userRateLimit: {
        stats: userStats,
        config: this.getUserConfig(),
        enabled: this.userConfig.enabled,
      },
    }
  }
}

// -- singleton managers per provider --

const instances: Partial<Record<Provider, RateLimitedAI>> = {}

export function getRateLimitedAI(provider: Provider, config?: Partial<ApiKeyConfig>) {
  if (!instances[provider]) {
    instances[provider] = new RateLimitedAI(provider, config)
  }
  return instances[provider]!
}

export async function getModel(provider: Provider, modelName: string) {
  return (await getRateLimitedAI(provider)).getModel(modelName)()
}
export async function getEmbeddingModel(provider: Provider, modelName: string) {
  return (await getRateLimitedAI(provider)).getEmbeddingModel(modelName)()
}

export const rateLimitedAI = {
  google: {
    model: (n = 'gemini-2.5-flash-lite') => getModel('google', n),
    embedding: (n = 'text-embedding-004') => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('google').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('google').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('google').generateObject(o, u),
    embed: (o: any, u?: string) => getRateLimitedAI('google').embed(o, u),
    getUsageStats: () => getRateLimitedAI('google').getUsageStats(),
    rotateKey: () => getRateLimitedAI('google').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('google').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('google').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('google').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('google').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('google').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('google').getUserConfig(),
    updateUserConfig: (c: any) => getRateLimitedAI('google').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('google').getFullStatus(u),
  },
  groq: {
    model: (n = 'gemma2-9b-it') => getModel('groq', n),
    embedding: (n = 'text-embedding-004') => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('groq').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('groq').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('groq').generateObject(o, u),
    embed: (o: any, u?: string) => getRateLimitedAI('groq').embed(o, u),
    getUsageStats: () => getRateLimitedAI('groq').getUsageStats(),
    rotateKey: () => getRateLimitedAI('groq').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('groq').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('groq').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('groq').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('groq').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('groq').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('groq').getUserConfig(),
    updateUserConfig: (c: any) => getRateLimitedAI('groq').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('groq').getFullStatus(u),
  },
  cerebras: {
    model: (n = 'llama-3.3-70b') => getModel('cerebras', n),
    embedding: (n = 'text-embedding-004') => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('cerebras').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('cerebras').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('cerebras').generateObject(o, u),
    embed: (o: any, u?: string) => getRateLimitedAI('cerebras').embed(o, u),
    getUsageStats: () => getRateLimitedAI('cerebras').getUsageStats(),
    rotateKey: () => getRateLimitedAI('cerebras').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('cerebras').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('cerebras').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('cerebras').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('cerebras').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('cerebras').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('cerebras').getUserConfig(),
    updateUserConfig: (c: any) => getRateLimitedAI('cerebras').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('cerebras').getFullStatus(u),
  },
}

export default rateLimitedAI
