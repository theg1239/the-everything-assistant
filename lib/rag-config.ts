import { modelRegistry, type ModelProvider } from './model-registry'

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001'

const rawProvider = process.env.RAG_EMBEDDING_PROVIDER
const registryProvider = modelRegistry.knowledgeEmbedding.provider

export const ragEmbeddingProvider: ModelProvider =
  rawProvider === 'google' ||
  rawProvider === 'openai' ||
  rawProvider === 'groq' ||
  rawProvider === 'cerebras' ||
  rawProvider === 'openrouter' ||
  rawProvider === 'direct'
    ? rawProvider
    : registryProvider

export const ragEmbeddingModelId =
  process.env.RAG_EMBEDDING_MODEL ||
  (ragEmbeddingProvider === 'openai'
    ? DEFAULT_OPENAI_EMBEDDING_MODEL
    : ragEmbeddingProvider === 'google'
      ? DEFAULT_GOOGLE_EMBEDDING_MODEL
      : modelRegistry.knowledgeEmbedding.modelId)

const parsedDim = Number.parseInt(process.env.RAG_EMBEDDING_DIM || '', 10)
const defaultOpenAIEmbeddingDim = ragEmbeddingModelId === 'text-embedding-3-small' ? 1536 : 3072

export const ragEmbeddingDim = Number.isFinite(parsedDim)
  ? parsedDim
  : ragEmbeddingProvider === 'openai'
    ? defaultOpenAIEmbeddingDim
    : 3072
