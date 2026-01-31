import { modelRegistry, type ModelProvider } from './model-registry'

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
    ? 'text-embedding-3-large'
    : modelRegistry.knowledgeEmbedding.modelId)

const parsedDim = Number.parseInt(process.env.RAG_EMBEDDING_DIM || '', 10)
export const ragEmbeddingDim = Number.isFinite(parsedDim)
  ? parsedDim
  : ragEmbeddingProvider === 'openai'
    ? 3072
    : 3072
