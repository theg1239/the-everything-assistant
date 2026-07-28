import { modelRegistry, type ModelProvider } from './model-registry'

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large'

export const ragEmbeddingProvider: ModelProvider = 'openai'

export const ragEmbeddingModelId =
  process.env.OPENAI_EMBEDDING_MODEL ||
  process.env.RAG_EMBEDDING_MODEL ||
  modelRegistry.knowledgeEmbedding.modelId ||
  DEFAULT_OPENAI_EMBEDDING_MODEL

const parsedDim = Number.parseInt(process.env.RAG_EMBEDDING_DIM || '', 10)
const defaultOpenAIEmbeddingDim = ragEmbeddingModelId === 'text-embedding-3-large' ? 3072 : 1536

export const ragEmbeddingDim = Number.isFinite(parsedDim) ? parsedDim : defaultOpenAIEmbeddingDim
