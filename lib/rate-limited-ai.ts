import { createGoogleGenerativeAI } from '@ai-sdk/google' // Google provider
import { googleTools } from '@ai-sdk/google/internal'
import { createGroq } from '@ai-sdk/groq' // Groq provider
import { createCerebras } from '@ai-sdk/cerebras' // Cerebras provider
import { createOpenRouter } from '@openrouter/ai-sdk-provider' // OpenRouter provider
import { createOpenAI } from '@ai-sdk/openai' // OpenAI provider
import { ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'
import { UserRateLimiter, UserRateLimitConfig, loadUserRateLimitConfig } from './user-rate-limiter'
import { modelIds } from './model-registry'
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

type Provider = 'google' | 'groq' | 'cerebras' | 'openrouter' | 'openai'

type GoogleProvider = ReturnType<typeof createGoogleGenerativeAI>
type GoogleToolset = GoogleProvider['tools']
type GoogleSearchToolOptions = Parameters<GoogleToolset['googleSearch']>[0]
type GoogleUrlContextOptions = Parameters<GoogleToolset['urlContext']>[0]
type GoogleFileSearchOptions = Parameters<GoogleToolset['fileSearch']>[0]
type GoogleCodeExecutionOptions = Parameters<GoogleToolset['codeExecution']>[0]
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

    switch (this.provider) {
      case 'google': {
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
        break
      }
      case 'groq': {
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
        break
      }
      case 'cerebras': {
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
        break
      }
      case 'openrouter': {
        if (process.env.OPENROUTER_API_KEY) {
          keys.push(process.env.OPENROUTER_API_KEY)
        }
        for (let i = 2; i <= 10; i++) {
          const k = process.env[`OPENROUTER_API_KEY_${i}`]
          if (k) keys.push(k)
        }
        if (keys.length === 0 && process.env.OPENROUTER_API_KEYS) {
          keys.push(
            ...process.env.OPENROUTER_API_KEYS.split(',')
              .map(x => x.trim())
              .filter(Boolean)
          )
        }
        if (keys.length === 0) {
          throw new Error(
            'No OpenRouter API keys found. Please set OPENROUTER_API_KEY or OPENROUTER_API_KEYS.'
          )
        }
        break
      }
      case 'openai': {
        if (process.env.OPENAI_API_KEY) {
          keys.push(process.env.OPENAI_API_KEY)
        }
        for (let i = 2; i <= 10; i++) {
          const k = process.env[`OPENAI_API_KEY_${i}`]
          if (k) keys.push(k)
        }
        if (keys.length === 0 && process.env.OPENAI_API_KEYS) {
          keys.push(
            ...process.env.OPENAI_API_KEYS.split(',')
              .map(x => x.trim())
              .filter(Boolean)
          )
        }
        if (keys.length === 0) {
          throw new Error('No OpenAI API keys found. Please set OPENAI_API_KEY or OPENAI_API_KEYS.')
        }
        break
      }
      default: {
        throw new Error(`Unsupported provider: ${this.provider}`)
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
    if (this.provider === 'openrouter') {
      return createOpenRouter({ apiKey })
    }
    if (this.provider === 'openai') {
      return createOpenAI({ apiKey })
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

  async withProvider<T>(fn: (provider: any) => T | Promise<T>) {
    const key = await this.apiKeyManager.getCurrentKey()
    const provider = this.createProviderInstance(key)
    return fn(provider)
  }

  getEmbeddingModel(modelName: string = modelIds.embedding): () => Promise<any> {
    return async () => {
      const key = await this.apiKeyManager.getCurrentKey()
      const google = createGoogleGenerativeAI({ apiKey: key })
      return google.textEmbeddingModel(modelName) as any
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
      const modelFn = google.textEmbeddingModel(
        options.model?.modelId || modelIds.embedding
      ) as unknown as EmbeddingModel<string>

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

  async generateImage(
    options: {
      model?: string
      prompt: string
      aspectRatio?: string
    },
    userId?: string
  ): Promise<{ image: { base64: string; mimeType: string }; images: { base64: string; mimeType: string }[] }> {
    if (this.provider !== 'google') {
      throw new Error('Image generation is only supported for the Google provider')
    }

    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }

    return this.apiKeyManager.executeWithRateLimit(async key => {
      const google = createGoogleGenerativeAI({ apiKey: key })
      const modelId = options.model || 'gemini-2.5-flash-image'

      let fullPrompt = options.prompt
      if (options.aspectRatio) {
        fullPrompt = `${options.prompt} (aspect ratio: ${options.aspectRatio})`
      }

      const result = await generateText({
        model: google(modelId),
        prompt: fullPrompt,
      })

      const imageFiles = (result.files || []).filter(file => 
        file.mediaType.startsWith('image/')
      )

      if (imageFiles.length === 0) {
        throw new Error('No images were generated by the model')
      }

      return {
        image: {
          base64: imageFiles[0].base64,
          mimeType: imageFiles[0].mediaType,
        },
        images: imageFiles.map(img => ({
          base64: img.base64,
          mimeType: img.mediaType,
        })),
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
    model: (n = modelIds.chat) => getModel('google', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('google').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('google').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('google').generateObject(o, u),
    generateImage: (o: { model?: string; prompt: string; aspectRatio?: string }, u?: string) => getRateLimitedAI('google').generateImage(o, u),
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
    tools: {
      google_search: (options?: GoogleSearchToolOptions) => googleTools.googleSearch(options ?? {}),
      urlContext: (options?: GoogleUrlContextOptions) => googleTools.urlContext(options ?? {}),
      fileSearch: (options: GoogleFileSearchOptions) => googleTools.fileSearch(options),
      codeExecution: (options?: GoogleCodeExecutionOptions) =>
        googleTools.codeExecution(options ?? {}),
    },
  },
  groq: {
    model: (n = 'gemma2-9b-it') => getModel('groq', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
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
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
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
  openrouter: {
    model: (n = 'openrouter/sherlock-think-alpha') => getModel('openrouter', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('openrouter').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('openrouter').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('openrouter').generateObject(o, u),
    embed: (o: any, u?: string) => getRateLimitedAI('openrouter').embed(o, u),
    getUsageStats: () => getRateLimitedAI('openrouter').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openrouter').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openrouter').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openrouter').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openrouter').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openrouter').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openrouter').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openrouter').getUserConfig(),
    updateUserConfig: (c: any) => getRateLimitedAI('openrouter').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openrouter').getFullStatus(u),
  },
  openai: {
    model: (n = 'gpt-5-mini') => getModel('openai', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: any, u?: string) => getRateLimitedAI('openai').streamText(o, u),
    generateText: (o: any, u?: string) => getRateLimitedAI('openai').generateText(o, u),
    generateObject: (o: any, u?: string) => getRateLimitedAI('openai').generateObject(o, u),
    embed: (o: any, u?: string) => getRateLimitedAI('openai').embed(o, u),
    getUsageStats: () => getRateLimitedAI('openai').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openai').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openai').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openai').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openai').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openai').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openai').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openai').getUserConfig(),
    updateUserConfig: (c: any) => getRateLimitedAI('openai').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openai').getFullStatus(u),
  },
}

export default rateLimitedAI
