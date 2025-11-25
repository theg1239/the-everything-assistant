import type { MCPClientConfig, MCPTransportType } from './mcp-config'

export type { MCPClientConfig, MCPTransportType } from './mcp-config'

export interface MCPTransportConfig {
  type: MCPTransportType
  url: string
  headers?: Record<string, string>
}

export function createTransportConfig(config: MCPClientConfig): MCPTransportConfig {
  return {
    type: config.transportType,
    url: config.url,
    headers: config.headers,
  }
}

let mcpAvailable: boolean | null = null

async function isMCPAvailable(): Promise<boolean> {
  if (mcpAvailable !== null) return mcpAvailable
  
  try {
    require.resolve('@ai-sdk/mcp')
    mcpAvailable = true
    return true
  } catch {
    mcpAvailable = false
    return false
  }
}

interface MCPClient {
  tools: () => Promise<Record<string, unknown>>
  close: () => Promise<void>
}

export async function createMCPClientFromConfig(config: MCPClientConfig): Promise<MCPClient | null> {
  try {
    if (!(await isMCPAvailable())) {
      console.warn('[@ai-sdk/mcp] Package not installed. Install with: pnpm add @ai-sdk/mcp')
      return null
    }
    
    const mcpModule = require('@ai-sdk/mcp')
    const createMCPClient = mcpModule.experimental_createMCPClient
    
    if (!createMCPClient) {
      console.error('experimental_createMCPClient not found in @ai-sdk/mcp')
      return null
    }
    
    const transport = createTransportConfig(config)
    
    const client = await createMCPClient({
      transport,
    })
    
    return client as MCPClient
  } catch (error) {
    console.error(`Failed to create MCP client for ${config.name}:`, error)
    return null
  }
}

export async function fetchMCPTools(configs: MCPClientConfig[]): Promise<{
  tools: Record<string, any>
  clients: any[]
  errors: Array<{ config: MCPClientConfig; error: string }>
}> {
  const enabledConfigs = configs.filter(c => c.enabled)
  
  if (enabledConfigs.length === 0) {
    return { tools: {}, clients: [], errors: [] }
  }
  
  const results = await Promise.allSettled(
    enabledConfigs.map(async (config) => {
      const client = await createMCPClientFromConfig(config)
      if (!client) {
        throw new Error(`Failed to create client for ${config.name}`)
      }
      
      const tools = await client.tools()
      return { config, client, tools }
    })
  )
  
  const tools: Record<string, any> = {}
  const clients: any[] = []
  const errors: Array<{ config: MCPClientConfig; error: string }> = []
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const config = enabledConfigs[i]
    
    if (result.status === 'fulfilled') {
      const configTools = result.value.tools
      for (const [toolName, tool] of Object.entries(configTools)) {
        const namespacedKey = `mcp_${config.name.replace(/\s+/g, '-').toLowerCase()}_${toolName}`
        tools[namespacedKey] = tool
      }
      clients.push(result.value.client)
    } else {
      errors.push({
        config,
        error: result.reason?.message || 'Unknown error',
      })
    }
  }
  
  return { tools, clients, errors }
}

export async function closeMCPClients(clients: any[]): Promise<void> {
  await Promise.allSettled(
    clients.map(async (client) => {
      try {
        await client.close()
      } catch (error) {
        console.error('Error closing MCP client:', error)
      }
    })
  )
}

export function parseMCPConfigsFromJSON(json: string | null | undefined): MCPClientConfig[] {
  if (!json) return []
  
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    
    return parsed.filter((item): item is MCPClientConfig => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.url === 'string' &&
        (item.transportType === 'http' || item.transportType === 'sse') &&
        typeof item.enabled === 'boolean'
      )
    })
  } catch {
    return []
  }
}
