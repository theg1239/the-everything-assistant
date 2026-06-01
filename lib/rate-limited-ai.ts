import { createGoogleGenerativeAI } from '@ai-sdk/google' // Google provider
import { googleTools } from '@ai-sdk/google/internal'
import { createGroq } from '@ai-sdk/groq' // Groq provider
import { createCerebras } from '@ai-sdk/cerebras' // Cerebras provider
import { createOpenRouter } from '@openrouter/ai-sdk-provider' // OpenRouter provider
import { createOpenAI } from '@ai-sdk/openai' // OpenAI provider
import { createWebSocketFetch } from 'ai-sdk-openai-websocket-fetch'
import { ApiKeyEntry, ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'
import { UserRateLimiter, UserRateLimitConfig, loadUserRateLimitConfig } from './user-rate-limiter'
import { modelIds, modelRegistry } from './model-registry'
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

type Provider = 'google' | 'groq' | 'cerebras' | 'openrouter' | 'openai' | 'direct'

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001'

const openaiWebSocketFetch = createWebSocketFetch()
const createOpenAIProvider = (apiKey: string) =>
  createOpenAI({ apiKey, fetch: openaiWebSocketFetch })

type GoogleProvider = ReturnType<typeof createGoogleGenerativeAI>
type GoogleToolset = GoogleProvider['tools']
type GoogleSearchToolOptions = Parameters<GoogleToolset['googleSearch']>[0]
type GoogleUrlContextOptions = Parameters<GoogleToolset['urlContext']>[0]
type GoogleFileSearchOptions = Parameters<GoogleToolset['fileSearch']>[0]
type GoogleCodeExecutionOptions = Parameters<GoogleToolset['codeExecution']>[0]

// Type for streamText/generateText options - uses SDK's own types internally
interface TextGenerationOptions {
  model?: { modelId: string }
  messages?: ModelMessage[]
  tools?: Record<string, unknown>
  temperature?: number
  maxOutputTokens?: number
  providerOptions?: {
    google?: Record<string, unknown>
    openai?: Record<string, unknown>
  }
  providerOverrides?: Partial<Record<Provider, Partial<TextGenerationOptions>>>
  [key: string]: unknown
}

interface ApiKeySelectionOptions {
  excludeIndices?: number[]
  allowedProviders?: Provider[]
  preferredProviders?: Provider[]
  onKeySelected?: (keyIndex: number, entry?: ApiKeyEntry) => void
}

// Type for embed options
interface EmbedOptions {
  model?: { modelId: string }
  value?: string
  values?: string[]
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
      primaryProvider: provider,
    }
    this.userConfig = {
      ...loadUserRateLimitConfig(),
      ...customUserConfig,
    }
    this.apiKeyManager = new ApiKeyManager(this.config)
    this.userRateLimiter = new UserRateLimiter(this.userConfig)
  }

  private loadKeysForProvider(provider: Provider): string[] {
    if (provider === 'direct') return []
    const config = {
      google: {
        primary: 'GOOGLE_GENERATIVE_AI_API_KEY',
        list: 'GOOGLE_AI_API_KEYS',
        label: 'Google AI',
      },
      groq: {
        primary: 'GROQ_API_KEY',
        list: 'GROQ_API_KEYS',
        label: 'Groq',
      },
      cerebras: {
        primary: 'CEREBRAS_API_KEY',
        list: 'CEREBRAS_API_KEYS',
        label: 'Cerebras',
      },
      openrouter: {
        primary: 'OPENROUTER_API_KEY',
        list: 'OPENROUTER_API_KEYS',
        label: 'OpenRouter',
      },
      openai: {
        primary: 'OPENAI_API_KEY',
        list: 'OPENAI_API_KEYS',
        label: 'OpenAI',
      },
    } as const

    const entry = config[provider]
    if (!entry) return []
    const keys = new Set<string>()
    const primaryValue = process.env[entry.primary]
    if (primaryValue) keys.add(primaryValue)
    for (let i = 2; i <= 10; i++) {
      const value = process.env[`${entry.primary}_${i}`]
      if (value) keys.add(value)
    }
    const listValue = process.env[entry.list]
    if (listValue) {
      for (const value of listValue
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)) {
        keys.add(value)
      }
    }
    return [...keys]
  }

  private loadApiKeysFromEnvironment(): ApiKeyEntry[] {
    const entries: ApiKeyEntry[] = []
    const primaryKeys = this.loadKeysForProvider(this.provider)
    for (const key of primaryKeys) {
      entries.push({ key, provider: this.provider })
    }

    if (this.provider === 'google') {
      const openaiKeys = this.loadKeysForProvider('openai')
      for (const key of openaiKeys) {
        entries.push({ key, provider: 'openai' })
      }
      if (primaryKeys.length === 0 && openaiKeys.length > 0) {
        console.warn(
          '[RateLimitedAI] No Google keys found; using OpenAI keys as fallback for text-only calls.'
        )
      }
    }

    if (entries.length === 0) {
      switch (this.provider) {
        case 'google':
          throw new Error(
            'No Google/OpenAI API keys found. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY.'
          )
        case 'groq':
          throw new Error('No Groq API keys found. Please set GROQ_API_KEY or GROQ_API_KEYS.')
        case 'cerebras':
          throw new Error(
            'No Cerebras API keys found. Please set CEREBRAS_API_KEY or CEREBRAS_API_KEYS.'
          )
        case 'openrouter':
          throw new Error(
            'No OpenRouter API keys found. Please set OPENROUTER_API_KEY or OPENROUTER_API_KEYS.'
          )
        case 'openai':
          throw new Error('No OpenAI API keys found. Please set OPENAI_API_KEY or OPENAI_API_KEYS.')
        case 'direct':
          throw new Error('Direct provider does not use API keys')
        default:
          throw new Error(`Unsupported provider: ${this.provider}`)
      }
    }

    const counts: Record<string, number> = {}
    for (const entry of entries) {
      const key = entry.provider || 'unknown'
      counts[key] = (counts[key] || 0) + 1
    }
    const countSummary = Object.entries(counts)
      .map(([provider, count]) => `${provider}:${count}`)
      .join(', ')
    console.log(`[RateLimitedAI] Loaded API keys (${countSummary})`)
    return entries
  }

  private createProviderInstance(apiKey: string, providerOverride?: Provider) {
    const provider = providerOverride ?? this.provider
    if (provider === 'direct') {
      throw new Error('Direct provider does not support provider instances')
    }
    if (provider === 'google') {
      return createGoogleGenerativeAI({ apiKey })
    }
    if (provider === 'groq') {
      return createGroq({ apiKey })
    }
    if (provider === 'openrouter') {
      return createOpenRouter({ apiKey })
    }
    if (provider === 'openai') {
      return createOpenAIProvider(apiKey)
    }
    return createCerebras({ apiKey })
  }

  getModel(modelName: string) {
    return async () => {
      const entry = await this.apiKeyManager.getCurrentKey({
        allowedProviders: [this.provider],
        preferredProviders: [this.provider],
      })
      const provider = this.createProviderInstance(entry.key, entry.provider as Provider)
      return provider(modelName)
    }
  }

  async withProvider<T>(
    fn: (provider: ReturnType<typeof this.createProviderInstance>) => T | Promise<T>
  ): Promise<T> {
    const entry = await this.apiKeyManager.getCurrentKey({
      allowedProviders: [this.provider],
      preferredProviders: [this.provider],
    })
    const provider = this.createProviderInstance(entry.key, entry.provider as Provider)
    return fn(provider)
  }

  getEmbeddingModel(modelName: string = modelIds.embedding): () => Promise<EmbeddingModel> {
    return async () => {
      const allowedProviders =
        this.provider === 'google'
          ? ['google', 'openai']
          : this.provider === 'openai'
            ? ['openai']
            : ['google']
      const preferredProviders = allowedProviders
      const entry = await this.apiKeyManager.getCurrentKey({
        allowedProviders,
        preferredProviders,
      })
      const provider = (entry.provider as Provider) ?? this.provider
      const resolvedModelId = this.resolveEmbeddingModelId(modelName, provider)
      if (provider === 'openai') {
        const openai = createOpenAIProvider(entry.key)
        return openai.textEmbeddingModel(resolvedModelId) as unknown as EmbeddingModel
      }
      const google = createGoogleGenerativeAI({ apiKey: entry.key })
      return google.textEmbeddingModel(resolvedModelId) as unknown as EmbeddingModel
    }
  }

  private getAllowedProvidersForText(): Provider[] {
    if (this.provider === 'direct') return ['direct']
    if (this.provider === 'google') return ['google', 'openai']
    return [this.provider]
  }

  private getPreferredProvidersForText(): Provider[] {
    if (this.provider === 'direct') return ['direct']
    if (this.provider === 'google') return ['google', 'openai']
    return [this.provider]
  }

  private resolveModelId(baseModelId: string | undefined, provider: Provider): string {
    if (provider === this.provider) return baseModelId ?? ''
    if (this.provider === 'google' && provider === 'openai') {
      return process.env.OPENAI_FALLBACK_MODEL || 'gpt-5.4-mini'
    }
    return baseModelId ?? ''
  }

  private resolveEmbeddingModelId(
    requestedModelId: string | undefined,
    provider: Provider
  ): string {
    const normalizedModelId = requestedModelId?.trim()
    const prefixMatch = normalizedModelId?.match(/^(openai|google)\/(.+)$/i)
    const requestedProvider = prefixMatch?.[1]?.toLowerCase() as Provider | undefined
    const unprefixedModelId = prefixMatch?.[2] ?? normalizedModelId

    if (provider === 'openai') {
      if (requestedProvider && requestedProvider !== 'openai') {
        return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL
      }
      return (
        process.env.OPENAI_EMBEDDING_MODEL || unprefixedModelId || DEFAULT_OPENAI_EMBEDDING_MODEL
      )
    }

    if (provider === 'google') {
      if (
        requestedProvider === 'openai' ||
        unprefixedModelId?.startsWith('text-embedding-3') ||
        unprefixedModelId?.startsWith('text-embedding-ada')
      ) {
        return DEFAULT_GOOGLE_EMBEDDING_MODEL
      }
      return unprefixedModelId || DEFAULT_GOOGLE_EMBEDDING_MODEL
    }

    return unprefixedModelId ?? modelIds.embedding
  }

  private buildOptionsForProvider(
    options: TextGenerationOptions,
    provider: Provider
  ): TextGenerationOptions {
    const { providerOverrides, ...rest } = options as TextGenerationOptions & {
      providerOverrides?: Partial<Record<Provider, Partial<TextGenerationOptions>>>
    }
    const override = providerOverrides?.[provider] ?? {}
    const baseProviderOptions = rest.providerOptions ?? {}
    const overrideProviderOptions = (override as TextGenerationOptions).providerOptions ?? {}
    const mergedProviderOptions = { ...baseProviderOptions, ...overrideProviderOptions }
    const merged = {
      ...rest,
      ...override,
      providerOptions: mergedProviderOptions,
    } as TextGenerationOptions
    if (merged.providerOptions && typeof merged.providerOptions === 'object') {
      const selected = (merged.providerOptions as any)[provider]
      merged.providerOptions = selected ? { [provider]: selected } : undefined
    }
    if (provider === 'openai' && Object.prototype.hasOwnProperty.call(merged, 'temperature')) {
      delete (merged as { temperature?: number }).temperature
    }
    delete (merged as any).providerOverrides
    return merged
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
      const allowedProviders = keyOptions.allowedProviders ?? this.getAllowedProvidersForText()
      const preferredProviders =
        keyOptions.preferredProviders ?? this.getPreferredProvidersForText()
      let selectedProvider: Provider | undefined
      let selectedIndex: number | undefined
      const result = await this.apiKeyManager.executeWithRateLimit(
        async (entry, index) => {
          const provider = (entry.provider as Provider) ?? this.provider
          selectedProvider = provider
          selectedIndex = index
          keyOptions.onKeySelected?.(index, entry)
          const providerInstance = this.createProviderInstance(entry.key, provider)
          const modelId = this.resolveModelId(enrichedOptions.model?.modelId, provider)
          const finalOptions = this.buildOptionsForProvider(enrichedOptions, provider)
          const modelFn = this.wrapModelWithWarningDefaults(providerInstance(modelId))
          return streamText({ ...finalOptions, model: modelFn } as any)
        },
        {
          excludeIndices: keyOptions.excludeIndices,
          allowedProviders,
          preferredProviders,
        }
      )
      console.warn('[RateLimitedAI] streamText provider responded', {
        provider: selectedProvider ?? this.provider,
        keyIndex: selectedIndex,
        modelId: options.model?.modelId,
        elapsedMs: Date.now() - streamStart,
      })
      return result
    } finally {
      clearSlowLog()
    }
  }

  async generateText(options: TextGenerationOptions, userId?: string): Promise<any> {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }

    const enrichedOptions = this.withGoogleRetryOptions(options)
    const allowedProviders = this.getAllowedProvidersForText()
    const preferredProviders = this.getPreferredProvidersForText()

    return this.apiKeyManager.executeWithRateLimit(
      async (entry, index) => {
        const provider = (entry.provider as Provider) ?? this.provider
        const providerInstance = this.createProviderInstance(entry.key, provider)
        const modelId = this.resolveModelId(enrichedOptions.model?.modelId, provider)
        const finalOptions = this.buildOptionsForProvider(enrichedOptions, provider)
        const modelFn = this.wrapModelWithWarningDefaults(providerInstance(modelId))
        return generateText({ ...finalOptions, model: modelFn } as any)
      },
      {
        allowedProviders,
        preferredProviders,
      }
    )
  }

  async generateObject<T>(options: TextGenerationOptions & { schema?: unknown }, userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }

    const enrichedOptions = this.withGoogleRetryOptions(options)
    const allowedProviders = this.getAllowedProvidersForText()
    const preferredProviders = this.getPreferredProvidersForText()

    return this.apiKeyManager.executeWithRateLimit(
      async (entry, index) => {
        const provider = (entry.provider as Provider) ?? this.provider
        const providerInstance = this.createProviderInstance(entry.key, provider)
        const modelId = this.resolveModelId(enrichedOptions.model?.modelId, provider)
        const finalOptions = this.buildOptionsForProvider(enrichedOptions, provider)
        const modelFn = this.wrapModelWithWarningDefaults(providerInstance(modelId))
        return generateObject({ ...finalOptions, model: modelFn, schema: options.schema } as any)
      },
      {
        allowedProviders,
        preferredProviders,
      }
    )
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
    const allowedProviders =
      this.provider === 'google'
        ? ['google', 'openai']
        : this.provider === 'openai'
          ? ['openai']
          : ['google']
    const preferredProviders = allowedProviders
    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const provider = (entry.provider as Provider) ?? this.provider
        const resolvedModelId = this.resolveEmbeddingModelId(options.model?.modelId, provider)
        const modelFn =
          provider === 'openai'
            ? createOpenAIProvider(entry.key).textEmbeddingModel(resolvedModelId)
            : createGoogleGenerativeAI({ apiKey: entry.key }).textEmbeddingModel(resolvedModelId)
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
      },
      {
        allowedProviders,
        preferredProviders,
      }
    )
  }

  async generateImage(
    options: {
      model?: string
      prompt: string
      aspectRatio?: string
    },
    userId?: string
  ): Promise<{
    image: { base64: string; mimeType: string }
    images: { base64: string; mimeType: string }[]
  }> {
    if (this.provider !== 'google') {
      throw new Error('Image generation is only supported for the Google provider')
    }

    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }

    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const google = createGoogleGenerativeAI({ apiKey: entry.key })
        const modelId = options.model || 'gemini-2.5-flash-image'

        let fullPrompt = options.prompt
        if (options.aspectRatio) {
          fullPrompt = `${options.prompt} (aspect ratio: ${options.aspectRatio})`
        }

        const result = await generateText({
          model: google(modelId),
          prompt: fullPrompt,
        })

        const imageFiles = (result.files || []).filter(file => file.mediaType.startsWith('image/'))

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
      },
      {
        allowedProviders: ['google'],
        preferredProviders: ['google'],
      }
    )
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

  async banKeyByIndex(index: number, cooldownMs?: number) {
    return this.apiKeyManager.banKeyByIndex(index, cooldownMs)
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

type DirectModelInput = { modelId: string } | string | undefined

const getDirectModelId = (input: DirectModelInput): string | undefined => {
  if (!input) return undefined
  if (typeof input === 'string') return input
  if (typeof input.modelId === 'string') return input.modelId
  return undefined
}

const getProviderFromModelId = (modelId?: string): string | undefined => {
  if (!modelId) return undefined
  const [provider, ...rest] = modelId.split('/')
  return rest.length > 0 ? provider : undefined
}

class DirectAI {
  private userRateLimiter: UserRateLimiter
  private userConfig: UserRateLimitConfig

  constructor(customUserConfig?: Partial<UserRateLimitConfig>) {
    this.userConfig = {
      ...loadUserRateLimitConfig(),
      ...customUserConfig,
    }
    this.userRateLimiter = new UserRateLimiter(this.userConfig)
  }

  private async enforceUserRateLimit(userId?: string) {
    if (userId && this.userConfig.enabled) {
      const u = await this.userRateLimiter.checkRateLimit(userId)
      if (!u.allowed) throw new Error(`Rate limit: ${u.error}`)
    }
  }

  private normalizeTextOptions(options: TextGenerationOptions) {
    const modelId = getDirectModelId(options.model)
    const provider = getProviderFromModelId(modelId)
    let providerOverrides = options.providerOverrides as
      | Record<string, Partial<TextGenerationOptions>>
      | undefined

    if (providerOverrides && provider) {
      if (providerOverrides.direct && !providerOverrides[provider]) {
        providerOverrides = { ...providerOverrides, [provider]: providerOverrides.direct }
      }
      if (providerOverrides.direct) {
        const { direct: _direct, ...rest } = providerOverrides
        providerOverrides = rest
      }
    } else if (providerOverrides?.direct) {
      const { direct: _direct, ...rest } = providerOverrides
      providerOverrides = rest
    }

    return {
      ...options,
      model: modelId ?? options.model,
      providerOverrides,
    }
  }

  async streamText(
    options: TextGenerationOptions,
    userId?: string,
    _keyOptions: ApiKeySelectionOptions = {}
  ): Promise<any> {
    await this.enforceUserRateLimit(userId)
    const normalized = this.normalizeTextOptions(options)
    return streamText(normalized as any)
  }

  async generateText(options: TextGenerationOptions, userId?: string): Promise<any> {
    await this.enforceUserRateLimit(userId)
    const normalized = this.normalizeTextOptions(options)
    return generateText(normalized as any)
  }

  async generateObject<T>(options: TextGenerationOptions & { schema?: unknown }, userId?: string) {
    await this.enforceUserRateLimit(userId)
    const normalized = this.normalizeTextOptions(options)
    return generateObject({ ...(normalized as any), schema: options.schema } as any)
  }

  async embed(
    options: { model?: DirectModelInput; value: string },
    userId?: string
  ): Promise<EmbedResult>

  async embed(
    options: { model?: DirectModelInput; values: string[] },
    userId?: string
  ): Promise<EmbedManyResult>

  async embed(
    options: { model?: DirectModelInput; value?: string; values?: string[] },
    userId?: string
  ): Promise<EmbedResult | EmbedManyResult> {
    await this.enforceUserRateLimit(userId)
    const resolvedModel = getDirectModelId(options.model) || modelRegistry.embedding.modelId
    const model = resolvedModel as any

    if (Array.isArray(options.values)) {
      return embedMany({
        model,
        values: options.values,
      })
    }

    return embed({
      model,
      value: options.value ?? '',
    })
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
}

const instances: Partial<Record<Provider, RateLimitedAI>> = {}

export function getRateLimitedAI(provider: Provider, config?: Partial<ApiKeyConfig>) {
  if (provider === 'direct') {
    throw new Error('Direct provider does not use rate-limited clients')
  }
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

let directInstance: DirectAI | null = null
const getDirectAI = () => {
  if (!directInstance) {
    directInstance = new DirectAI()
  }
  return directInstance
}

export const rateLimitedAI = {
  direct: {
    model: async (n = modelRegistry.chat.modelId) => n,
    embedding: async (n = modelRegistry.embedding.modelId) => n,
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getDirectAI().streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) => getDirectAI().generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getDirectAI().generateObject<T>(o, u),
    embed: (
      o:
        | { model?: DirectModelInput; value: string }
        | { model?: DirectModelInput; values: string[] },
      u?: string
    ) => getDirectAI().embed(o as any, u),
    banKeyByIndex: async (_i: number) => {},
    rotateKey: async () => {},
    resetRateLimits: async () => {},
    getUsageStats: async () => ({ stats: [], config: { primaryProvider: 'direct' } }),
    getUserUsageStats: (u: string) => getDirectAI().getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getDirectAI().checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getDirectAI().resetUserRateLimits(u),
    getUserConfig: () => getDirectAI().getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) => getDirectAI().updateUserConfig(c),
    getFullStatus: async (u?: string) => ({
      apiKeys: { stats: [], config: { primaryProvider: 'direct' } },
      userRateLimit: {
        stats: u ? await getDirectAI().getUserUsageStats(u) : null,
        config: getDirectAI().getUserConfig(),
        enabled: getDirectAI().getUserConfig().enabled,
      },
    }),
  },
  google: {
    model: (n = modelIds.chat) => getModel('google', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('google').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) =>
      getRateLimitedAI('google').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getRateLimitedAI('google').generateObject<T>(o, u),
    generateImage: (o: { model?: string; prompt: string; aspectRatio?: string }, u?: string) =>
      getRateLimitedAI('google').generateImage(o, u),
    embed: (o: EmbedOptions, u?: string) =>
      getRateLimitedAI('google').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('google').getUsageStats(),
    rotateKey: () => getRateLimitedAI('google').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('google').resetRateLimits(),
    banKeyByIndex: (i: number, c?: number) => getRateLimitedAI('google').banKeyByIndex(i, c),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('google').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('google').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('google').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('google').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('google').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('google').updateUserConfig(c),
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
    generateText: (o: TextGenerationOptions, u?: string) =>
      getRateLimitedAI('groq').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getRateLimitedAI('groq').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) =>
      getRateLimitedAI('groq').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('groq').getUsageStats(),
    rotateKey: () => getRateLimitedAI('groq').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('groq').resetRateLimits(),
    banKeyByIndex: (i: number, c?: number) => getRateLimitedAI('groq').banKeyByIndex(i, c),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('groq').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('groq').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('groq').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('groq').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('groq').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('groq').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('groq').getFullStatus(u),
  },
  cerebras: {
    model: (n = 'llama-3.3-70b') => getModel('cerebras', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('cerebras').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) =>
      getRateLimitedAI('cerebras').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getRateLimitedAI('cerebras').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) =>
      getRateLimitedAI('cerebras').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('cerebras').getUsageStats(),
    rotateKey: () => getRateLimitedAI('cerebras').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('cerebras').resetRateLimits(),
    banKeyByIndex: (i: number, c?: number) => getRateLimitedAI('cerebras').banKeyByIndex(i, c),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('cerebras').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('cerebras').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('cerebras').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('cerebras').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('cerebras').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('cerebras').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('cerebras').getFullStatus(u),
  },
  openrouter: {
    model: (n = 'openrouter/sherlock-think-alpha') => getModel('openrouter', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('google', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('openrouter').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) =>
      getRateLimitedAI('openrouter').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getRateLimitedAI('openrouter').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) =>
      getRateLimitedAI('openrouter').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('openrouter').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openrouter').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openrouter').resetRateLimits(),
    banKeyByIndex: (i: number, c?: number) => getRateLimitedAI('openrouter').banKeyByIndex(i, c),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openrouter').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openrouter').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openrouter').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openrouter').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openrouter').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('openrouter').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openrouter').getFullStatus(u),
  },
  openai: {
    model: (n = 'gpt-5.4-mini') => getModel('openai', n),
    embedding: (n = modelIds.embedding) => getEmbeddingModel('openai', n),
    streamText: (o: TextGenerationOptions, u?: string, k?: ApiKeySelectionOptions) =>
      getRateLimitedAI('openai').streamText(o, u, k),
    generateText: (o: TextGenerationOptions, u?: string) =>
      getRateLimitedAI('openai').generateText(o, u),
    generateObject: <T>(o: TextGenerationOptions & { schema?: unknown }, u?: string) =>
      getRateLimitedAI('openai').generateObject<T>(o, u),
    embed: (o: EmbedOptions, u?: string) =>
      getRateLimitedAI('openai').embed(o as { model?: { modelId: string }; value: string }, u),
    getUsageStats: () => getRateLimitedAI('openai').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openai').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openai').resetRateLimits(),
    banKeyByIndex: (i: number, c?: number) => getRateLimitedAI('openai').banKeyByIndex(i, c),
    updateConfig: (c: Partial<ApiKeyConfig>) => getRateLimitedAI('openai').updateConfig(c),
    getUserUsageStats: (u: string) => getRateLimitedAI('openai').getUserUsageStats(u),
    checkUserRateLimit: (u: string) => getRateLimitedAI('openai').checkUserRateLimit(u),
    resetUserRateLimits: (u: string) => getRateLimitedAI('openai').resetUserRateLimits(u),
    getUserConfig: () => getRateLimitedAI('openai').getUserConfig(),
    updateUserConfig: (c: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('openai').updateUserConfig(c),
    getFullStatus: (u?: string) => getRateLimitedAI('openai').getFullStatus(u),
  },
}

export default rateLimitedAI
