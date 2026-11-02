import * as z from 'zod'

const mcpTransportTypeSchema = z.enum(['http', 'sse'])

export type MCPTransportType = z.infer<typeof mcpTransportTypeSchema>

/**
 * Configs come from localStorage / request JSON. Identity fields are required;
 * bookkeeping fields fall back instead of rejecting the entry.
 */
const mcpClientConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transportType: mcpTransportTypeSchema,
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional().catch(undefined),
  enabled: z.boolean(),
  createdAt: z.number().catch(0),
  updatedAt: z.number().catch(0),
})

export type MCPClientConfig = z.infer<typeof mcpClientConfigSchema>

/** Keeps the entries of an untrusted array that are valid MCP client configs. */
export function parseMCPConfigList(value: unknown): MCPClientConfig[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = mcpClientConfigSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

const MCP_CONFIGS_STORAGE_KEY = 'custom-mcp-configs'

export function getMCPConfigs(): MCPClientConfig[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(MCP_CONFIGS_STORAGE_KEY)
    if (!stored) return []
    
    return parseMCPConfigList(JSON.parse(stored))
  } catch (error) {
    console.error('Failed to parse MCP configs from localStorage:', error)
    return []
  }
}

export function saveMCPConfigs(configs: MCPClientConfig[]): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(MCP_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  } catch (error) {
    console.error('Failed to save MCP configs to localStorage:', error)
  }
}

export function addMCPConfig(config: Omit<MCPClientConfig, 'id' | 'createdAt' | 'updatedAt'>): MCPClientConfig {
  const now = Date.now()
  const newConfig: MCPClientConfig = {
    ...config,
    id: `mcp-${now}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  }
  
  const configs = getMCPConfigs()
  configs.push(newConfig)
  saveMCPConfigs(configs)
  
  return newConfig
}

export function updateMCPConfig(id: string, updates: Partial<Omit<MCPClientConfig, 'id' | 'createdAt'>>): MCPClientConfig | null {
  const configs = getMCPConfigs()
  const index = configs.findIndex(c => c.id === id)
  const existing = configs[index]
  
  if (!existing) return null
  
  const updated: MCPClientConfig = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  }
  configs[index] = updated
  
  saveMCPConfigs(configs)
  return updated
}

export function removeMCPConfig(id: string): boolean {
  const configs = getMCPConfigs()
  const filtered = configs.filter(c => c.id !== id)
  
  if (filtered.length === configs.length) return false
  
  saveMCPConfigs(filtered)
  return true
}

export function getEnabledMCPConfigs(): MCPClientConfig[] {
  return getMCPConfigs().filter(c => c.enabled)
}

export function toggleMCPConfig(id: string): MCPClientConfig | null {
  const configs = getMCPConfigs()
  const config = configs.find(c => c.id === id)
  
  if (!config) return null
  
  return updateMCPConfig(id, { enabled: !config.enabled })
}
