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
  chat: { provider: 'openai', modelId: 'gpt-5.4-mini' },
  chatLite: { provider: 'openai', modelId: 'gpt-5.4-mini' },
  chatAttachment: { provider: 'openai', modelId: 'gpt-5.4-mini' },
  chatAutocomplete: { provider: 'direct', modelId: 'meta/llama-3.1-8b' },
  embedding: { provider: 'openai', modelId: 'text-embedding-3-small' },
  knowledgeEmbedding: { provider: 'openai', modelId: 'text-embedding-3-small' },
  followUps: { provider: 'direct', modelId: 'mistral/ministral-3b' },
  whatsappBot: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  hubVtop: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  hubVtopFormatter: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  placementFormatter: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  vtopParser: { provider: 'google', modelId: 'openai/gpt-5.4-mini' },
  chatTitle: { provider: 'direct', modelId: 'mistral/ministral-3b' },
  thinkHarder: { provider: 'openai', modelId: 'gpt-5.4-mini' },
  thinkHarderAdmin: { provider: 'openai', modelId: 'gpt-5.4' },
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
