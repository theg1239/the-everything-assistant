/**
 * Scira-style "group" definitions. A group is a bundle of tools that make
 * sense together (e.g. everything needed to answer VTOP questions), plus a
 * per-group system-prompt preamble. The chat route picks a group based on the
 * user's selection or routing heuristics, then the tool-loader filters the
 * full tool registry down to the group's allowlist.
 *
 * Existing EA code can keep building its own `tools` object as before — this
 * file defines the vocabulary for future refactors and is already used by
 * ExamCooker's study route.
 */

export interface GroupConfig {
  /** Stable identifier shown in UI and stored on message metadata. */
  id: string
  /** Human-friendly label for pickers. */
  label: string
  /** Tool-name allowlist. If empty, the full registry is used. */
  tools: string[]
  /** Optional preamble prepended to the base system prompt. */
  systemPrompt?: string
}

export const GROUPS = {
  general: {
    id: 'general',
    label: 'General',
    tools: [],
    systemPrompt:
      'Answer the user directly. Prefer tool calls when they would produce faster, more accurate, or more up-to-date answers.',
  },
  vtop: {
    id: 'vtop',
    label: 'VTOP',
    tools: ['queryVTOP', 'vtopWebScraper'],
    systemPrompt:
      'The user is asking about VTOP data (attendance, marks, timetable, grades). Always use the VTOP tools rather than guessing from general knowledge.',
  },
  papers: {
    id: 'papers',
    label: 'Papers',
    tools: ['searchPapersCodeChef', 'searchPapersService', 'scrapeVITPaperVault', 'scrapeExamCooker'],
    systemPrompt:
      'The user is looking for past papers. Use the paper-search tools and surface direct download links with course code, exam type, slot, and year whenever possible.',
  },
  memory: {
    id: 'memory',
    label: 'Memory',
    tools: ['memoryAdd', 'memorySearch', 'memoryList'],
    systemPrompt:
      'Persist useful facts the user mentions and recall them on demand. Explicitly confirm what you have stored or retrieved.',
  },
  web: {
    id: 'web',
    label: 'Web',
    tools: ['parallelWebSearch', 'parallelWebExtract', 'google_search'],
    systemPrompt: 'Prefer fresh web sources. Cite the URLs you actually used.',
  },
} as const satisfies Record<string, GroupConfig>

export type GroupId = keyof typeof GROUPS

export function getGroupConfig(id: string | null | undefined): GroupConfig {
  if (!id) return GROUPS.general
  return (GROUPS as Record<string, GroupConfig>)[id] ?? GROUPS.general
}
