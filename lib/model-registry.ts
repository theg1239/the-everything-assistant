export type ModelProvider = 'openai'

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
  chat: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  chatLite: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  chatAttachment: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  chatAutocomplete: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  embedding: { provider: 'openai', modelId: 'text-embedding-3-large' },
  knowledgeEmbedding: { provider: 'openai', modelId: 'text-embedding-3-large' },
  followUps: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  whatsappBot: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  hubVtop: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  hubVtopFormatter: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  placementFormatter: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  vtopParser: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  chatTitle: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  thinkHarder: { provider: 'openai', modelId: 'gpt-6.1-terra' },
  thinkHarderAdmin: { provider: 'openai', modelId: 'gpt-6.1-terra' },
}

export const modelRegistry = registry

export const modelIds: Record<ModelKey, string> = Object.fromEntries(
  Object.entries(registry).map(([key, value]) => [key, value.modelId])
) as Record<ModelKey, string>

export function getModelConfig(key: ModelKey): ModelConfig {
  return registry[key]
}
