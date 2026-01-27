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
  | 'thinkHarder'
  | 'thinkHarderAdmin'

export type ModelConfig = {
  provider: ModelProvider
  modelId: string
}

const registry: Record<ModelKey, ModelConfig> = {
  chat: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
  chatLite: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
  chatAttachment: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
  chatAutocomplete: { provider: 'cerebras', modelId: 'llama-3.1-8b' },
  embedding: { provider: 'google', modelId: 'gemini-embedding-001' },
  knowledgeEmbedding: { provider: 'openai', modelId: 'text-embedding-3-large' },
  followUps: { provider: 'groq', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  whatsappBot: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  hubVtop: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  hubVtopFormatter: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  placementFormatter: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  vtopParser: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  chatTitle: { provider: 'google', modelId: 'gemini-flash-lite-latest' },
  thinkHarder: { provider: 'openai', modelId: 'gpt-5-mini' },
  thinkHarderAdmin: { provider: 'openai', modelId: 'gpt-5.1' },
}

export const modelRegistry = registry

export const modelIds: Record<ModelKey, string> = Object.fromEntries(
  Object.entries(registry).map(([key, value]) => [key, value.modelId])
) as Record<ModelKey, string>

export function getModelConfig(key: ModelKey): ModelConfig {
  return registry[key]
}
