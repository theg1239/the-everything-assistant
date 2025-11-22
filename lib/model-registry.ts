export type ModelProvider = 'google' | 'groq' | 'cerebras' | 'openrouter' | 'openai'

export type ModelKey =
  | 'chat'
  | 'chatLite'
  | 'chatAttachment'
  | 'chatAutocomplete'
  | 'embedding'
  | 'knowledgeEmbedding'
  | 'followUps'
  | 'whatsappBot'
  | 'hubVtop'
  | 'hubVtopFormatter'
  | 'placementFormatter'
  | 'vtopParser'
  | 'chatTitle'

export type ModelConfig = {
  provider: ModelProvider
  modelId: string
}

const registry: Record<ModelKey, ModelConfig> = {
  chat: { provider: 'google', modelId: 'gemini-flash-latest' },
  chatLite: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
  chatAttachment: { provider: 'google', modelId: 'gemini-flash-latest' },
  chatAutocomplete: { provider: 'cerebras', modelId: 'llama-3.1-8b' },
  embedding: { provider: 'google', modelId: 'gemini-embedding-001' },
  knowledgeEmbedding: { provider: 'google', modelId: 'gemini-embedding-001' },
  followUps: { provider: 'groq', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  whatsappBot: { provider: 'google', modelId: 'gemini-flash-latest' },
  hubVtop: { provider: 'google', modelId: 'gemini-flash-latest' },
  hubVtopFormatter: { provider: 'google', modelId: 'gemini-flash-latest' },
  placementFormatter: { provider: 'google', modelId: 'gemini-flash-latest' },
  vtopParser: { provider: 'google', modelId: 'gemini-flash-latest' },
  chatTitle: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
}

export const modelRegistry = registry

export const modelIds: Record<ModelKey, string> = Object.fromEntries(
  Object.entries(registry).map(([key, value]) => [key, value.modelId])
) as Record<ModelKey, string>

export function getModelConfig(key: ModelKey): ModelConfig {
  return registry[key]
}
