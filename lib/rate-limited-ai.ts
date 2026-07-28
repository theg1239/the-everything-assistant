import { createOpenAI, openai } from '@ai-sdk/openai'
import { createWebSocketFetch } from '@vercel/ai-sdk-openai-websocket-fetch'
import {
  embed,
  embedMany,
  generateImage as generateImageWithModel,
  generateObject,
  generateText,
  streamText,
  type EmbedManyResult,
  type EmbedResult,
  type EmbeddingModel,
  type ModelMessage,
} from 'ai'
import { ApiKeyEntry, ApiKeyManager, ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from './api-key-manager'
import { UserRateLimiter, UserRateLimitConfig, loadUserRateLimitConfig } from './user-rate-limiter'
import { modelIds, modelRegistry, type ModelProvider } from './model-registry'

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large'
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2'

const openaiWebSocketFetch = createWebSocketFetch()
const createOpenAIProvider = (apiKey: string) =>
  createOpenAI({ apiKey, fetch: openaiWebSocketFetch })

type OpenAIWebSearchOptions = Parameters<typeof openai.tools.webSearch>[0]
type OpenAIFileSearchOptions = Parameters<typeof openai.tools.fileSearch>[0]
type OpenAICodeInterpreterOptions = Parameters<typeof openai.tools.codeInterpreter>[0]
type OpenAIImageGenerationOptions = Parameters<typeof openai.tools.imageGeneration>[0]

interface TextGenerationOptions {
  model?: { modelId: string }
  messages?: ModelMessage[]
  tools?: Record<string, unknown>
  temperature?: number
  maxOutputTokens?: number
  providerOptions?: {
    openai?: Record<string, unknown>
  }
  providerOverrides?: Partial<Record<ModelProvider, Partial<TextGenerationOptions>>>
  [key: string]: unknown
}

interface ApiKeySelectionOptions {
  excludeIndices?: number[]
  allowedProviders?: ModelProvider[]
  preferredProviders?: ModelProvider[]
  onKeySelected?: (keyIndex: number, entry?: ApiKeyEntry) => void
}

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

  constructor(
    customConfig?: Partial<ApiKeyConfig>,
    customUserConfig?: Partial<UserRateLimitConfig>
  ) {
    this.config = {
      ...DEFAULT_API_KEY_CONFIG,
      ...customConfig,
      keys: this.loadApiKeysFromEnvironment(),
      primaryProvider: 'openai',
    }
    this.userConfig = {
      ...loadUserRateLimitConfig(),
      ...customUserConfig,
    }
    this.apiKeyManager = new ApiKeyManager(this.config)
    this.userRateLimiter = new UserRateLimiter(this.userConfig)
  }

  private loadApiKeysFromEnvironment(): ApiKeyEntry[] {
    const keys = new Set<string>()
    if (process.env.OPENAI_API_KEY) keys.add(process.env.OPENAI_API_KEY)

    for (let i = 2; i <= 10; i++) {
      const value = process.env[`OPENAI_API_KEY_${i}`]
      if (value) keys.add(value)
    }

    for (const value of (process.env.OPENAI_API_KEYS || '')
      .split(',')
      .map(key => key.trim())
      .filter(Boolean)) {
      keys.add(value)
    }

    if (keys.size === 0) {
      throw new Error('No OpenAI API keys found. Set OPENAI_API_KEY or OPENAI_API_KEYS.')
    }

    console.log(`[RateLimitedAI] Loaded OpenAI API keys (${keys.size})`)
    return [...keys].map(key => ({ key, provider: 'openai' }))
  }

  private async enforceUserRateLimit(userId?: string) {
    if (!userId || !this.userConfig.enabled) return
    const result = await this.userRateLimiter.checkRateLimit(userId)
    if (!result.allowed) throw new Error(`Rate limit: ${result.error}`)
  }

  private buildOptions(options: TextGenerationOptions): TextGenerationOptions {
    const { providerOverrides, ...rest } = options
    const override = providerOverrides?.openai ?? {}
    const modelId = options.model?.modelId || modelRegistry.chat.modelId
    const openaiProviderOptions = {
      reasoningEffort: modelId === 'gpt-5.6-sol' ? 'high' : 'none',
      ...(rest.providerOptions?.openai ?? {}),
      ...(override.providerOptions?.openai ?? {}),
    }
    const merged = {
      ...rest,
      ...override,
      providerOptions: { openai: openaiProviderOptions },
    } as TextGenerationOptions

    // GPT-5 family reasoning models reject temperature unless reasoning is disabled
    // in a compatible request shape. Keep request behavior deterministic here.
    if (Object.prototype.hasOwnProperty.call(merged, 'temperature')) {
      delete merged.temperature
    }

    return merged
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
        const result = this.normalizeWarnings(await original(args))
        const stream = result?.stream as any
        if (stream && typeof stream.pipeThrough === 'function') {
          result.stream = stream.pipeThrough(
            new TransformStream({
              transform: (chunk, controller) => {
                controller.enqueue(
                  chunk && !Array.isArray(chunk.warnings) ? { ...chunk, warnings: [] } : chunk
                )
              },
            })
          )
        }
        return result
      }
    }

    return wrapped
  }

  async getModel(modelName: string) {
    const entry = await this.apiKeyManager.getCurrentKey({
      allowedProviders: ['openai'],
      preferredProviders: ['openai'],
    })
    return createOpenAIProvider(entry.key)(modelName)
  }

  async getEmbeddingModel(modelName: string = modelIds.embedding): Promise<EmbeddingModel> {
    const entry = await this.apiKeyManager.getCurrentKey({
      allowedProviders: ['openai'],
      preferredProviders: ['openai'],
    })
    return createOpenAIProvider(entry.key).embeddingModel(
      modelName || DEFAULT_OPENAI_EMBEDDING_MODEL
    ) as unknown as EmbeddingModel
  }

  async streamText(
    options: TextGenerationOptions,
    userId?: string,
    keyOptions: ApiKeySelectionOptions = {}
  ): Promise<any> {
    await this.enforceUserRateLimit(userId)

    const startedAt = Date.now()
    let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn('[RateLimitedAI] streamText still awaiting OpenAI response', {
        modelId: options.model?.modelId,
        elapsedMs: Date.now() - startedAt,
      })
    }, 15000)

    try {
      const result = await this.apiKeyManager.executeWithRateLimit(
        async (entry, index) => {
          keyOptions.onKeySelected?.(index, entry)
          const provider = createOpenAIProvider(entry.key)
          const model = this.wrapModelWithWarningDefaults(
            provider(options.model?.modelId || modelRegistry.chat.modelId)
          )
          return streamText({ ...this.buildOptions(options), model } as any)
        },
        {
          excludeIndices: keyOptions.excludeIndices,
          allowedProviders: ['openai'],
          preferredProviders: ['openai'],
        }
      )

      console.warn('[RateLimitedAI] streamText provider responded', {
        provider: 'openai',
        modelId: options.model?.modelId,
        elapsedMs: Date.now() - startedAt,
      })
      return result
    } finally {
      if (slowTimer) {
        clearTimeout(slowTimer)
        slowTimer = null
      }
    }
  }

  async generateText(options: TextGenerationOptions, userId?: string): Promise<any> {
    await this.enforceUserRateLimit(userId)
    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const provider = createOpenAIProvider(entry.key)
        const model = this.wrapModelWithWarningDefaults(
          provider(options.model?.modelId || modelRegistry.chat.modelId)
        )
        return generateText({ ...this.buildOptions(options), model } as any)
      },
      {
        allowedProviders: ['openai'],
        preferredProviders: ['openai'],
      }
    )
  }

  async generateObject<T>(options: TextGenerationOptions & { schema?: unknown }, userId?: string) {
    await this.enforceUserRateLimit(userId)
    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const provider = createOpenAIProvider(entry.key)
        const model = this.wrapModelWithWarningDefaults(
          provider(options.model?.modelId || modelRegistry.chat.modelId)
        )
        return generateObject({
          ...this.buildOptions(options),
          model,
          schema: options.schema,
        } as any)
      },
      {
        allowedProviders: ['openai'],
        preferredProviders: ['openai'],
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
    await this.enforceUserRateLimit(userId)
    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const provider = createOpenAIProvider(entry.key)
        const model = this.wrapModelWithWarningDefaults(
          provider.embeddingModel(
            options.model?.modelId || modelIds.embedding || DEFAULT_OPENAI_EMBEDDING_MODEL
          )
        )

        if (Array.isArray(options.values)) {
          return embedMany({ model, values: options.values })
        }
        return embed({ model, value: options.value ?? '' })
      },
      {
        allowedProviders: ['openai'],
        preferredProviders: ['openai'],
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
    await this.enforceUserRateLimit(userId)
    return this.apiKeyManager.executeWithRateLimit(
      async entry => {
        const provider = createOpenAIProvider(entry.key)
        const result = await generateImageWithModel({
          model: provider.image(options.model || DEFAULT_OPENAI_IMAGE_MODEL),
          prompt: options.prompt,
          ...(options.aspectRatio
            ? { aspectRatio: options.aspectRatio as `${number}:${number}` }
            : {}),
        })
        const images = result.images.map(image => ({
          base64: image.base64,
          mimeType: image.mediaType,
        }))
        return { image: images[0], images }
      },
      {
        allowedProviders: ['openai'],
        preferredProviders: ['openai'],
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

  updateConfig(config: Partial<ApiKeyConfig>) {
    this.config = { ...this.config, ...config }
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

  updateUserConfig(config: Partial<UserRateLimitConfig>) {
    this.userConfig = { ...this.userConfig, ...config }
    this.userRateLimiter.updateConfig(config)
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

let instance: RateLimitedAI | null = null

export function getRateLimitedAI(
  provider: ModelProvider = 'openai',
  config?: Partial<ApiKeyConfig>
) {
  if (provider !== 'openai') {
    throw new Error(`Unsupported provider: ${provider}. Only OpenAI is configured.`)
  }
  if (!instance) instance = new RateLimitedAI(config)
  return instance
}

export async function getModel(provider: ModelProvider, modelName: string) {
  return getRateLimitedAI(provider).getModel(modelName)
}

export async function getEmbeddingModel(provider: ModelProvider, modelName: string) {
  return getRateLimitedAI(provider).getEmbeddingModel(modelName)
}

export const rateLimitedAI = {
  openai: {
    model: (name = modelIds.chat) => getModel('openai', name),
    embedding: (name = modelIds.embedding) => getEmbeddingModel('openai', name),
    streamText: (
      options: TextGenerationOptions,
      userId?: string,
      keyOptions?: ApiKeySelectionOptions
    ) => getRateLimitedAI('openai').streamText(options, userId, keyOptions),
    generateText: (options: TextGenerationOptions, userId?: string) =>
      getRateLimitedAI('openai').generateText(options, userId),
    generateObject: <T>(options: TextGenerationOptions & { schema?: unknown }, userId?: string) =>
      getRateLimitedAI('openai').generateObject<T>(options, userId),
    generateImage: (
      options: { model?: string; prompt: string; aspectRatio?: string },
      userId?: string
    ) => getRateLimitedAI('openai').generateImage(options, userId),
    embed: (options: EmbedOptions, userId?: string) =>
      getRateLimitedAI('openai').embed(
        options as { model?: { modelId: string }; value: string },
        userId
      ),
    getUsageStats: () => getRateLimitedAI('openai').getUsageStats(),
    rotateKey: () => getRateLimitedAI('openai').rotateKey(),
    resetRateLimits: () => getRateLimitedAI('openai').resetRateLimits(),
    banKeyByIndex: (index: number, cooldownMs?: number) =>
      getRateLimitedAI('openai').banKeyByIndex(index, cooldownMs),
    updateConfig: (config: Partial<ApiKeyConfig>) =>
      getRateLimitedAI('openai').updateConfig(config),
    getUserUsageStats: (userId: string) => getRateLimitedAI('openai').getUserUsageStats(userId),
    checkUserRateLimit: (userId: string) => getRateLimitedAI('openai').checkUserRateLimit(userId),
    resetUserRateLimits: (userId: string) => getRateLimitedAI('openai').resetUserRateLimits(userId),
    getUserConfig: () => getRateLimitedAI('openai').getUserConfig(),
    updateUserConfig: (config: Partial<UserRateLimitConfig>) =>
      getRateLimitedAI('openai').updateUserConfig(config),
    getFullStatus: (userId?: string) => getRateLimitedAI('openai').getFullStatus(userId),
    tools: {
      web_search: (options?: OpenAIWebSearchOptions) => openai.tools.webSearch(options ?? {}),
      fileSearch: (options: OpenAIFileSearchOptions) => openai.tools.fileSearch(options),
      codeInterpreter: (options?: OpenAICodeInterpreterOptions) =>
        openai.tools.codeInterpreter(options),
      imageGeneration: (options?: OpenAIImageGenerationOptions) =>
        openai.tools.imageGeneration({
          model: DEFAULT_OPENAI_IMAGE_MODEL,
          ...options,
        }),
    },
  },
}

export default rateLimitedAI
