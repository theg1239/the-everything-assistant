import type { experimental_MCPClient as MCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import { parseMCPConfigList, type MCPClientConfig, type MCPTransportType } from './mcp-config'
import {
  MAX_MCP_SERVERS_PER_REQUEST,
  checkMCPServerUrl,
  isBlockedIpAddress,
  isIpLiteral,
  sanitizeMCPHeaders,
} from './mcp-url-policy'

export type { MCPClientConfig, MCPTransportType } from './mcp-config'

/** Time allowed for an MCP server to answer a request with headers / to list tools. */
const MCP_CONNECT_TIMEOUT_MS = 10_000

export interface MCPTransportConfig {
  type: MCPTransportType
  url: string
  headers?: Record<string, string>
  redirect: 'error'
  fetch: typeof fetch
}

const isCloudflareWorkers = () =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

/**
 * Re-checks the host after DNS resolution (a public name can point at 10.0.0.1 or
 * 169.254.169.254). Only possible where `node:dns` exists (Vercel's Node runtime).
 * On Cloudflare Workers outbound `fetch` cannot reach private networks or cloud
 * metadata endpoints, so the literal/hostname checks are the whole policy there.
 * Note: the connection re-resolves, so a DNS-rebinding host can still race this.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIpLiteral(hostname) || isCloudflareWorkers()) return
  // getBuiltinModule instead of an import: invisible to bundlers, so Worker builds
  // never try to resolve `node:dns`.
  const dns =
    typeof process.getBuiltinModule === 'function'
      ? process.getBuiltinModule('node:dns')
      : undefined
  if (!dns?.promises) return
  const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(entry => isBlockedIpAddress(entry.address))) {
    throw new Error('MCP server resolves to a private or reserved address')
  }
}

/**
 * `fetch` for one MCP transport: same-origin only (SSE servers announce their POST
 * endpoint, which must not move us to another host), never follows redirects, and
 * aborts when response headers take longer than `MCP_CONNECT_TIMEOUT_MS` (the
 * timer is cleared once headers arrive, so long-lived SSE bodies keep streaming).
 */
function createGuardedFetch(origin: string): typeof fetch {
  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(input instanceof Request ? input.url : input.toString())
    if (target.origin !== origin) {
      throw new Error('MCP request to a different origin blocked')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MCP_CONNECT_TIMEOUT_MS)
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal
    try {
      return await fetch(input, { ...init, signal, redirect: 'error' })
    } finally {
      clearTimeout(timer)
    }
  }
  return guarded
}

/** Transport for a config whose URL already passed `checkMCPServerUrl`. */
export function createTransportConfig(config: MCPClientConfig, url: URL): MCPTransportConfig {
  return {
    type: config.transportType,
    url: url.href,
    headers: sanitizeMCPHeaders(config.headers),
    redirect: 'error',
    fetch: createGuardedFetch(url.origin),
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
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
  const check = checkMCPServerUrl(config.url, {
    allowLocalhost: process.env.NODE_ENV === 'development',
  })
  if (!check.ok) {
    throw new Error(`MCP server URL rejected: ${check.reason}`)
  }
  await assertPublicHost(check.url.hostname.replace(/^\[|\]$/g, ''))

  try {
    if (!(await isMCPAvailable())) {
      console.warn('[@ai-sdk/mcp] Package not installed. Install with: pnpm add @ai-sdk/mcp')
      return null
    }

    const { experimental_createMCPClient: createMCPClient } = await import('@ai-sdk/mcp')

    return await createMCPClient({
      transport: createTransportConfig(config, check.url),
      initializationOptions: { timeout: MCP_CONNECT_TIMEOUT_MS },
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
  // Capped so one request cannot fan out to an unbounded number of servers.
  const enabledConfigs = configs.filter(c => c.enabled).slice(0, MAX_MCP_SERVERS_PER_REQUEST)
  
  if (enabledConfigs.length === 0) {
    return { tools: {}, clients: [], errors: [] }
  }
  
  const results = await Promise.allSettled(
    enabledConfigs.map(async (config) => {
      const client = await createMCPClientFromConfig(config)
      if (!client) {
        throw new Error(`Failed to create client for ${config.name}`)
      }
      
      try {
        const tools: ToolSet = await withTimeout(
          client.tools(),
          MCP_CONNECT_TIMEOUT_MS,
          `listing tools of ${config.name}`
        )
        return { config, client, tools }
      } catch (error) {
        await client.close().catch(() => undefined)
        throw error
      }
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
