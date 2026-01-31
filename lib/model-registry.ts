export type ModelProvider = 'google' | 'groq' | 'cerebras' | 'openrouter' | 'openai' | 'direct'

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
  chat: { provider: 'direct', modelId: 'google/gemini-2.5-flash-lite' },
  chatLite: { provider: 'direct', modelId: 'google/gemini-2.5-flash-lite' },
  chatAttachment: { provider: 'direct', modelId: 'google/gemini-2.5-flash-lite' },
  chatAutocomplete: { provider: 'direct', modelId: 'meta/llama-3.1-8b' },
  embedding: { provider: 'direct', modelId: 'google/gemini-embedding-001' },
  knowledgeEmbedding: { provider: 'direct', modelId: 'openai/text-embedding-3-large' },
  followUps: { provider: 'direct', modelId: 'mistral/ministral-3b' },
  whatsappBot: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  hubVtop: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  hubVtopFormatter: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  placementFormatter: { provider: 'google', modelId: 'gemini-3-flash-preview' },
  vtopParser: { provider: 'google', modelId: 'google/gemini-3-flash-preview' },
  chatTitle: { provider: 'direct', modelId: 'mistral/ministral-3b' },
  thinkHarder: { provider: 'openai', modelId: 'gpt-5-mini' },
  thinkHarderAdmin: { provider: 'openai', modelId: 'gpt-5.1' },
}

export const modelRegistry = registry

const stripDirectProviderPrefix = (modelId: string) => {
  const parts = modelId.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : modelId
}

export const modelIds: Record<ModelKey, string> = Object.fromEntries(
  Object.entries(registry).map(([key, value]) => [
    key,
    value.provider === 'direct' ? stripDirectProviderPrefix(value.modelId) : value.modelId,
  ])
) as Record<ModelKey, string>

export function getModelConfig(key: ModelKey): ModelConfig {
  return registry[key]
}
