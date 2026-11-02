import type { GroupConfig } from './group-config'

/**
 * Filter a full tool-registry down to a group's allowlist. Unknown names are
 * silently dropped so the caller can wire in MCP tools or provider tools
 * without breaking if a given group references something the registry hasn't
 * loaded yet. An empty `group.tools` means "return all tools", matching
 * Scira's behavior for the default group.
 */
const isRegistryKey = <Tools extends Record<string, unknown>>(
  registry: Tools,
  name: string
): name is Extract<keyof Tools, string> => name in registry

export function loadConfiguredTools<Tools extends Record<string, unknown>>(
  registry: Tools,
  group: GroupConfig
): Partial<Tools> {
  if (!group.tools || group.tools.length === 0) {
    return registry
  }
  const result: Partial<Tools> = {}
  for (const name of group.tools) {
    if (isRegistryKey(registry, name)) {
      result[name] = registry[name]
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
  const registryNames = Object.keys(registry).filter(name => isRegistryKey(registry, name))
  const groupAllowlist: readonly string[] = group.tools.length === 0 ? registryNames : group.tools

  const allowedSet = new Set(groupAllowlist)
  const pool = registryNames.filter(name => allowedSet.has(name))
  if (!activeToolNames?.length) return pool

  const userSet = new Set(activeToolNames)
  return pool.filter(name => userSet.has(name))
}
