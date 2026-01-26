import { createGoogleGenerativeAI } from '@ai-sdk/google' // Google provider
import { googleTools } from '@ai-sdk/google/internal'
import { createGroq } from '@ai-sdk/groq' // Groq provider
import { createCerebras } from '@ai-sdk/cerebras' // Cerebras provider
import { createOpenRouter } from '@openrouter/ai-sdk-provider' // OpenRouter provider
import { createOpenAI } from '@ai-sdk/openai' // OpenAI provider
import { ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG, ApiKeyManagerError } from './api-key-manager'
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
  type ModelMessage,
} from 'ai'
import type { EmbeddingModel } from 'ai'

type Provider = 'google' | 'groq' | 'cerebras' | 'openrouter' | 'openai'

type GoogleProvider = ReturnType<typeof createGoogleGenerativeAI>
type GoogleToolset = GoogleProvider['tools']
type GoogleSearchToolOptions = Parameters<GoogleToolset['googleSearch']>[0]
type GoogleUrlContextOptions = Parameters<GoogleToolset['urlContext']>[0]
type GoogleFileSearchOptions = Parameters<GoogleToolset['fileSearch']>[0]
type GoogleCodeExecutionOptions = Parameters<GoogleToolset['codeExecution']>[0]

// Type definitions for API error responses
interface APIError {
  statusCode?: number
  status?: number | string
  code?: number | string
  message?: string
  responseBody?: string
  data?: {
    error?: {
      status?: string
      message?: string
      code?: number
    }
  }
}

// Type for streamText/generateText options - uses SDK's own types internally
interface TextGenerationOptions {
  model?: { modelId: string }
  messages?: ModelMessage[]
  tools?: Record<string, unknown>
  temperature?: number
  maxTokens?: number
  providerOptions?: {
    google?: Record<string, unknown>
    openai?: Record<string, unknown>
  }
  [key: string]: unknown
}

interface ApiKeySelectionOptions {
  excludeIndices?: number[]
  onKeySelected?: (keyIndex: number) => void
}

// Type for embed options
interface EmbedOptions {
  model?: { modelId: string }
  value?: string
  values?: string[]
}

const truncateErrorText = (text: string, max = 500): string => {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

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

  async withProvider<T>(fn: (provider: ReturnType<typeof this.createProviderInstance>) => T | Promise<T>): Promise<T> {
    const key = await this.apiKeyManager.getCurrentKey()
    const provider = this.createProviderInstance(key)
    return fn(provider)
  }

  getEmbeddingModel(modelName: string = modelIds.embedding): () => Promise<EmbeddingModel> {
    return async () => {
      const key = await this.apiKeyManager.getCurrentKey()
      const google = createGoogleGenerativeAI({ apiKey: key })
      return google.textEmbeddingModel(modelName) as unknown as EmbeddingModel
    }
  }

  private isGoogleInternalError(error: unknown): boolean {
    const retryError = error as { reason?: string; lastError?: APIError; errors?: APIError[] }
    if (retryError?.reason === 'maxRetriesExceeded' && retryError?.lastError) {
      return this.checkInternalError(retryError.lastError)
    }
    
    if (retryError?.errors?.length) {
      return retryError.errors.some(e => this.checkInternalError(e))
    }
    
    return this.checkInternalError(error as APIError)
  }

  private isGoogleQuotaError(error: unknown): boolean {
    const retryError = error as { reason?: string; lastError?: APIError; errors?: APIError[] }
    if (retryError?.reason === 'maxRetriesExceeded' && retryError?.lastError) {
      return this.checkQuotaError(retryError.lastError)
    }

    if (retryError?.errors?.length) {
      return retryError.errors.some(e => this.checkQuotaError(e))
    }

    return this.checkQuotaError(error as APIError)
  }
  
  private checkInternalError(apiError: APIError): boolean {
    const statusCode = apiError?.statusCode || apiError?.status || apiError?.code
    const message = (apiError?.message || '').toLowerCase()
    const responseBody = apiError?.responseBody || ''
    
    const is500 = statusCode === 500
    const isInternalStatus = apiError?.data?.error?.status === 'INTERNAL' || 
                             (typeof responseBody === 'string' && responseBody.includes('"status": "INTERNAL"'))
    const isInternalMessage = message.includes('internal error') || 
                              message.includes('an internal error has occurred')
    
    return is500 && (isInternalStatus || isInternalMessage)
  }

  private checkQuotaError(apiError: APIError): boolean {
    const statusCode = apiError?.statusCode || apiError?.status || apiError?.code
    const message = (apiError?.message || '').toLowerCase()
    const responseBody = apiError?.responseBody || ''
    const status = apiError?.data?.error?.status

    const is429 = statusCode === 429
    const isResourceExhausted =
      status === 'RESOURCE_EXHAUSTED' ||
      (typeof responseBody === 'string' && responseBody.includes('"status": "RESOURCE_EXHAUSTED"'))
    const isQuotaMessage =
      message.includes('quota exceeded') ||
      message.includes('exceeded your current quota') ||
      message.includes('rate limit')

    return is429 && (isResourceExhausted || isQuotaMessage)
  }

  private shouldFallbackToOpenAI(error: unknown): boolean {
    const err = error as { code?: string; message?: string; cause?: { code?: string } }
    if (err?.cause?.code === 'ALL_KEYS_EXHAUSTED') return true
    if (err instanceof ApiKeyManagerError && err.code === 'ALL_KEYS_EXHAUSTED') return true
    if (err?.code === 'ALL_KEYS_EXHAUSTED') return true
    const msg = (err?.message || '').toLowerCase()
    return (
      msg.includes('all api keys failed') ||
      msg.includes('all_keys_rate_limited') ||
      msg.includes('no_valid_api_keys_available')
    )
  }

  private withGoogleRetryOptions(options: TextGenerationOptions): TextGenerationOptions {
    if (this.provider !== 'google') return options
    const providerOptions = options.providerOptions ?? {}
    const googleOptions = providerOptions.google ?? {}
    const hasMaxRetries = Object.prototype.hasOwnProperty.call(googleOptions, 'maxRetries')
    return {
      ...options,
      providerOptions: {
        ...providerOptions,
        google: hasMaxRetries ? googleOptions : { ...googleOptions, maxRetries: 2 },
      },
    }
  }

  private buildOpenAIFallbackOptions(options: TextGenerationOptions, modelId: string) {
    const openaiKey = this.loadOpenAIFallbackKey()
    if (!openaiKey) return null
    const openai = createOpenAI({ apiKey: openaiKey })
    return {
      ...options,
      model: openai(modelId),
      providerOptions: options.providerOptions?.openai
        ? { openai: options.providerOptions.openai }
        : undefined,
    }
  }

  private loadOpenAIFallbackKey(): string | null {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
    for (let i = 2; i <= 10; i++) {
      const key = process.env[`OPENAI_API_KEY_${i}`]
      if (key) return key
    }
    if (process.env.OPENAI_API_KEYS) {
      const [first] = process.env.OPENAI_API_KEYS.split(',')
        .map(x => x.trim())
        .filter(Boolean)
      return first ?? null
    }
    return null
  }

  private normalizeWarnings<T extends { warnings?: unknown }>(result: T): T {
    if (result && !Array.isArray(result.warnings)) {
      return { ...result, warnings: [] }
    }
    return result
  }

  private wrapModelWithWarningDefaults(model: any): any {
    if (!model || typeof model !== 'object') return model
    const wrapped = Object.create(model)

    if (typeof model.doGenerate === 'function') {
      const original = model.doGenerate.bind(model)
      wrapped.doGenerate = async (args: any) => this.normalizeWarnings(await original(args))
    }

    if (typeof model.doEmbed === 'function') {
      const original = model.doEmbed.bind(model)
      wrapped.doEmbed = async (args: any) => this.normalizeWarnings(await original(args))
    }

    if (typeof model.doStream === 'function') {
      const original = model.doStream.bind(model)
      wrapped.doStream = async (args: any) => {
        const res = this.normalizeWarnings(await original(args))
        const stream = res?.stream as any
        if (stream && typeof stream.pipeThrough === 'function') {
          const transformer = new TransformStream({
            transform: (chunk, controller) => {
              if (chunk && !Array.isArray((chunk as any).warnings)) {
                controller.enqueue({ ...(chunk as any), warnings: [] })
              } else {
                controller.enqueue(chunk)
              }
            },
          })
          res.stream = stream.pipeThrough(transformer)
        }
        return res
      }
    }

    return wrapped
  }

  async streamText(
    options: TextGenerationOptions,
    userId?: string,
    keyOptions: ApiKeySelectionOptions = {}
  ): Promise<any> {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }

    const streamStart = Date.now()
    let slowTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleSlowLog = () => {
      if (slowTimer) return
      slowTimer = setTimeout(() => {
        console.warn('[RateLimitedAI] streamText still awaiting provider response', {
          provider: this.provider,
          modelId: options.model?.modelId,
          elapsedMs: Date.now() - streamStart,
        })
      }, 15000)
    }
    const clearSlowLog = () => {
      if (slowTimer) {
        clearTimeout(slowTimer)
        slowTimer = null
      }
    }

    try {
      scheduleSlowLog()
      const enrichedOptions = this.withGoogleRetryOptions(options)
      const result = await this.apiKeyManager.executeWithRateLimit(async key => {
        const keyIndex = this.config.keys.indexOf(key)
        if (keyIndex >= 0) {
          keyOptions.onKeySelected?.(keyIndex)
        }
        const provider = this.createProviderInstance(key)
        const modelFn = this.wrapModelWithWarningDefaults(provider(enrichedOptions.model?.modelId ?? ''))
        return streamText({ ...enrichedOptions, model: modelFn } as any)
      }, { excludeIndices: keyOptions.excludeIndices })
      console.warn('[RateLimitedAI] streamText provider responded', {
        provider: this.provider,
        modelId: options.model?.modelId,
        elapsedMs: Date.now() - streamStart,
      })
      return result
    } catch (error: unknown) {
      clearSlowLog()
      const errorText =
        typeof error === 'string'
          ? error
          : (error as { message?: string })?.message || String(error)
      const isInternal = this.isGoogleInternalError(error)
      const isQuota = this.isGoogleQuotaError(error)
      const shouldFallback = this.shouldFallbackToOpenAI(error)
      if (
        this.provider === 'google' &&
        (isInternal || isQuota || shouldFallback)
      ) {
        console.warn('[RateLimitedAI] Google failure detected, falling back to OpenAI streamText', {
          isInternal,
          isQuota,
          shouldFallback,
          errorText: truncateErrorText(errorText),
        })
        const fallbackOptions = this.buildOpenAIFallbackOptions(options, 'gpt-5-nano')
        if (!fallbackOptions) throw error
        return streamText(fallbackOptions as any)
      }
      
      throw error
    } finally {
      clearSlowLog()
    }
  }

  async generateText(options: TextGenerationOptions, userId?: string): Promise<any> {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
    
    try {
      const enrichedOptions = this.withGoogleRetryOptions(options)
      return await this.apiKeyManager.executeWithRateLimit(async key => {
        const provider = this.createProviderInstance(key)
        const modelFn = this.wrapModelWithWarningDefaults(provider(enrichedOptions.model?.modelId ?? ''))
        return generateText({ ...enrichedOptions, model: modelFn } as any)
      })
    } catch (error: unknown) {
      const errorText =
        typeof error === 'string'
          ? error
          : (error as { message?: string })?.message || String(error)
      const isInternal = this.isGoogleInternalError(error)
      const isQuota = this.isGoogleQuotaError(error)
      const shouldFallback = this.shouldFallbackToOpenAI(error)
      if (
        this.provider === 'google' &&
        (isInternal || isQuota || shouldFallback)
      ) {
        console.warn('[RateLimitedAI] Google failure detected in generateText, falling back to OpenAI', {
          isInternal,
          isQuota,
          shouldFallback,
          errorText: truncateErrorText(errorText),
        })
        const fallbackOptions = this.buildOpenAIFallbackOptions(options, 'gpt-4o-mini')
        if (!fallbackOptions) throw error
        return generateText(fallbackOptions as any)
      }
      
      throw error
    }
  }

  async generateObject<T>(options: TextGenerationOptions & { schema?: unknown }, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
    try {
      const enrichedOptions = this.withGoogleRetryOptions(options)
      return await this.apiKeyManager.executeWithRateLimit(async key => {
        const provider = this.createProviderInstance(key)
        const modelFn = this.wrapModelWithWarningDefaults(provider(enrichedOptions.model?.modelId ?? ''))
        return generateObject({ ...enrichedOptions, model: modelFn } as any)
      })
    } catch (error: unknown) {
      const errorText =
        typeof error === 'string'
          ? error
          : (error as { message?: string })?.message || String(error)
      const isInternal = this.isGoogleInternalError(error)
      const isQuota = this.isGoogleQuotaError(error)
      const shouldFallback = this.shouldFallbackToOpenAI(error)
      if (
        this.provider === 'google' &&
        (isInternal || isQuota || shouldFallback)
      ) {
        console.warn('[RateLimitedAI] Google failure detected in generateObject, falling back to OpenAI', {
          isInternal,
          isQuota,
          shouldFallback,
          errorText: truncateErrorText(errorText),
        })
        const fallbackOptions = this.buildOpenAIFallbackOptions(options, 'gpt-4o-mini')
        if (!fallbackOptions) throw error
        return generateObject({ ...(fallbackOptions as any), schema: options.schema } as any)
      }
      throw error
    }
  }


  async embed(
    options: { model?: { modelId: string }; value: string },
    userId?: string
  ): Promise<EmbedResult>

  async embed(
    options: { model?: { modelId: string }; values: string[] },
    userId?: string
  ): Promise<EmbedManyResult>

  async embed(
    options: {
      model?: { modelId: string }
      value?: string
      values?: string[]
    },
    userId?: string
  ): Promise<EmbedResult | EmbedManyResult> {
    if (process.env.AI_EMBED_DEBUG === 'true') {
      const valueLen = typeof options.value === 'string' ? options.value.length : undefined
      const valuesCount = Array.isArray(options.values) ? options.values.length : undefined
      console.debug('[RateLimitedAI] embed debug', {
        provider: this.provider,
        modelId: options.model?.modelId || modelIds.embedding,
        valueType: typeof options.value,
        valueLength: valueLen,
        valuesCount,
      })
    }
    return this.apiKeyManager.executeWithRateLimit(async key => {
      const google = createGoogleGenerativeAI({ apiKey: key })
      const modelFn = google.textEmbeddingModel(
        options.model?.modelId || modelIds.embedding
      ) as unknown as EmbeddingModel
      const safeModel = this.wrapModelWithWarningDefaults(modelFn as any)

      if (Array.isArray(options.values)) {
        return embedMany({
          model: safeModel,
          values: options.values,
        })
      } else {
        return embed({
          model: safeModel,
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
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('google').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getRateLimitedAI('google').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) => getRateLimitedAI('google').generateObject<T>(o, u),
    generateImage: (o: { model?: string; prompt: string; aspectRatio?: string }, u?: string) => getRateLimitedAI('google').generateImage(o, u),
    embed: (o: EmbedOptions, u?: string) => getRateLimitedAI('google').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('google').getUsageStats(),
    rotateKey: () => getRateLimitedAI('google').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('google').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('google').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('google').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('google').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('google').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('google').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getRateLimitedAI('google').updateUserConfig(c),
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
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('groq').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getRateLimitedAI('groq').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) => getRateLimitedAI('groq').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) => getRateLimitedAI('groq').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('groq').getUsageStats(),
    rotateKey: () => getRateLimitedAI('groq').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('groq').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('groq').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('groq').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('groq').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('groq').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('groq').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getRateLimitedAI('groq').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('groq').getFullStatus(u),
  },
  cerebras: {
    model: (n = 'llama-3.3-70b') => getModel('cerebras', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('cerebras').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getRateLimitedAI('cerebras').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) => getRateLimitedAI('cerebras').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) => getRateLimitedAI('cerebras').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('cerebras').getUsageStats(),
    rotateKey: () => getRateLimitedAI('cerebras').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('cerebras').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('cerebras').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('cerebras').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('cerebras').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('cerebras').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('cerebras').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getRateLimitedAI('cerebras').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('cerebras').getFullStatus(u),
  },
  openrouter: {
    model: (n = 'openrouter/sherlock-think-alpha') => getModel('openrouter', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('openrouter').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getRateLimitedAI('openrouter').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) => getRateLimitedAI('openrouter').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) => getRateLimitedAI('openrouter').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('openrouter').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openrouter').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openrouter').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openrouter').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openrouter').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openrouter').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openrouter').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openrouter').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getRateLimitedAI('openrouter').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openrouter').getFullStatus(u),
  },
  openai: {
    model: (n = 'gpt-5-mini') => getModel('openai', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('openai').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getRateLimitedAI('openai').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) => getRateLimitedAI('openai').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) => getRateLimitedAI('openai').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('openai').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openai').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openai').resetRateLimits(),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openai').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openai').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openai').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openai').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openai').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getRateLimitedAI('openai').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openai').getFullStatus(u),
  },
}

export default rateLimitedAI
