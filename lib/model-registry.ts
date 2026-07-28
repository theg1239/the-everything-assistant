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
  chat: { provider: 'openai', modelId: 'gpt-5.6-terra' },
  chatLite: { provider: 'openai', modelId: 'gpt-5.6-terra' },
  chatAttachment: { provider: 'openai', modelId: 'gpt-5.6-terra' },
  chatAutocomplete: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  embedding: { provider: 'openai', modelId: 'text-embedding-3-large' },
  knowledgeEmbedding: { provider: 'openai', modelId: 'text-embedding-3-large' },
  followUps: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  whatsappBot: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  hubVtop: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  hubVtopFormatter: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  placementFormatter: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  vtopParser: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  chatTitle: { provider: 'openai', modelId: 'gpt-5.6-luna' },
  thinkHarder: { provider: 'openai', modelId: 'gpt-5.6-terra' },
  thinkHarderAdmin: { provider: 'openai', modelId: 'gpt-5.6-sol' },
}

export const modelRegistry = registry

export const modelIds: Record<ModelKey, string> = Object.fromEntries(
  Object.entries(registry).map(([key, value]) => [key, value.modelId])
) as Record<ModelKey, string>

export function getModelConfig(key: ModelKey): ModelConfig {
  return registry[key]
}
