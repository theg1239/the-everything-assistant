export type MCPTransportType = 'http' | 'sse'

export interface MCPClientConfig {
  id: string
  name: string
  transportType: MCPTransportType
  url: string
  headers?: Record<string, string>
  enabled: boolean
  createdAt: number
  updatedAt: number
}

const MCP_CONFIGS_STORAGE_KEY = 'custom-mcp-configs'

export function getMCPConfigs(): MCPClientConfig[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(MCP_CONFIGS_STORAGE_KEY)
    if (!stored) return []
    
    const configs = JSON.parse(stored)
    if (!Array.isArray(configs)) return []
    
    return configs
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
  
  if (index === -1) return null
  
  configs[index] = {
    ...configs[index],
    ...updates,
    updatedAt: Date.now(),
  }
  
  saveMCPConfigs(configs)
  return configs[index]
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
