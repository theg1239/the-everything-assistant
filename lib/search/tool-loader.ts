import type { GroupConfig } from './group-config'

/**
 * Filter a full tool-registry down to a group's allowlist. Unknown names are
 * silently dropped so the caller can wire in MCP tools or provider tools
 * without breaking if a given group references something the registry hasn't
 * loaded yet. An empty `group.tools` means "return all tools", matching
 * Scira's behavior for the default group.
 */
export function loadConfiguredTools<Tools extends Record<string, unknown>>(
  registry: Tools,
  group: GroupConfig
): Partial<Tools> {
  if (!group.tools || group.tools.length === 0) {
    return registry
  }
  const result: Partial<Tools> = {}
  for (const name of group.tools) {
    if (name in registry) {
      ;(result as Record<string, unknown>)[name] = (registry as Record<string, unknown>)[name]
    }
  }
  return result
}

export interface ActiveToolsOptions {
  group: GroupConfig
  /** Optional user-selected subset. When provided, narrows the group further. */
  activeToolNames?: string[]
}

/**
 * Compute the final `activeTools` list passed to `streamText`. Intersection of
 * group allowlist and user-selected subset. Empty group = every registered
 * tool; empty `activeToolNames` = the group's full allowlist.
 */
export function resolveActiveTools<Tools extends Record<string, unknown>>(
  registry: Tools,
  { group, activeToolNames }: ActiveToolsOptions
): (keyof Tools)[] {
  const registryNames = Object.keys(registry) as (keyof Tools)[]
  const groupAllowlist =
    group.tools.length === 0 ? registryNames : (group.tools as (keyof Tools)[])

  const allowedSet = new Set(groupAllowlist.map(String))
  const pool = registryNames.filter(name => allowedSet.has(String(name)))
  if (!activeToolNames?.length) return pool

  const userSet = new Set(activeToolNames)
  return pool.filter(name => userSet.has(String(name)))
}
