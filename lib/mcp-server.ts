import type { experimental_MCPClient as MCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import { parseMCPConfigList, type MCPClientConfig, type MCPTransportType } from './mcp-config'

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

export async function createMCPClientFromConfig(config: MCPClientConfig): Promise<MCPClient | null> {
  try {
    if (!(await isMCPAvailable())) {
      console.warn('[@ai-sdk/mcp] Package not installed. Install with: pnpm add @ai-sdk/mcp')
      return null
    }
    
    const { experimental_createMCPClient: createMCPClient } = await import('@ai-sdk/mcp')
    
    const transport = createTransportConfig(config)
    
    return await createMCPClient({
      transport,
    })
  } catch (error) {
    console.error(`Failed to create MCP client for ${config.name}:`, error)
    return null
  }
}

export async function fetchMCPTools(configs: MCPClientConfig[]): Promise<{
  tools: ToolSet
  clients: MCPClient[]
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
      
      const tools: ToolSet = await client.tools()
      return { config, client, tools }
    })
  )
  
  const tools: ToolSet = {}
  const clients: MCPClient[] = []
  const errors: Array<{ config: MCPClientConfig; error: string }> = []
  
  for (const [i, result] of results.entries()) {
    const config = enabledConfigs[i]
    if (!config) continue
    
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
        error: (result.reason instanceof Error && result.reason.message) || 'Unknown error',
      })
    }
  }
  
  return { tools, clients, errors }
}

export async function closeMCPClients(clients: readonly MCPClient[]): Promise<void> {
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
    return parseMCPConfigList(JSON.parse(json))
  } catch {
    return []
  }
}
