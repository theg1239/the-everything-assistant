import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import { createWebSocketFetch } from '@vercel/ai-sdk-openai-websocket-fetch'
import { modelIds, type ModelKey } from './model-registry'

/**
 * The app's single OpenAI provider (reads `OPENAI_API_KEY`). Requests go over
 * OpenAI's WebSocket transport, which keeps a warm connection between calls.
 *
 * Use it with the AI SDK primitives directly:
 *   streamText({ model: languageModel('chat'), providerOptions: defaultProviderOptions, ... })
 */
export const openai = createOpenAI({ fetch: createWebSocketFetch() })

/** Language model for a registry role, e.g. `languageModel('chatTitle')`. */
export const languageModel = (key: ModelKey) => openai(modelIds[key])

export type EmbeddingModelKey = Extract<ModelKey, 'embedding' | 'knowledgeEmbedding'>

/** Embedding model for a registry role (defaults to the general embedding model). */
export const embeddingModel = (key: EmbeddingModelKey = 'embedding') =>
  openai.embeddingModel(modelIds[key])

export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2'

export const imageModel = (modelId: string = DEFAULT_IMAGE_MODEL_ID) => openai.image(modelId)

/**
 * Provider options shared by every call. Reasoning is off unless a route opts
 * in by spreading its own `openai` options over these.
 */
export const defaultProviderOptions = {
  openai: { reasoningEffort: 'none' },
} satisfies ProviderOptions
