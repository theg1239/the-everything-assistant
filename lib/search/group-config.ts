/**
 * Scira-style "group" definitions. A group is a bundle of tools that make
 * sense together (e.g. everything needed to answer VTOP questions), plus a
 * per-group system-prompt preamble. The chat route picks a group based on the
 * user's `preferredTool` selection, then the tool-loader filters the full
 * registry down to the group's allowlist.
 *
 * Tool names below MUST match keys returned by `createVITTools` in
 * `lib/tools.ts` (plus provider-tools like `google_search`).
 */

export interface GroupConfig {
  /** Stable identifier shown in UI and stored on message metadata. */
  id: string
  /** Human-friendly label for pickers. */
  label: string
  /** Tool-name allowlist. If empty, the full registry is used. */
  tools: string[]
  /** Optional preamble appended to the base system prompt. */
  systemPrompt?: string
}

export const GROUPS = {
  general: {
    id: 'general',
    label: 'General',
    tools: [],
    systemPrompt:
      'Answer directly. Prefer tool calls when they produce faster, more accurate, or more up-to-date answers.',
  },
  vtop: {
    id: 'vtop',
    label: 'VTOP',
    tools: ['queryVTOP'],
    systemPrompt:
      'The user wants VTOP data (attendance, marks, timetable, grades). Always call queryVTOP rather than guessing from general knowledge.',
  },
  papers: {
    id: 'papers',
    label: 'Past Papers',
    tools: ['findPastPapers', 'resolveCourseCode', 'getCourseInfo'],
    systemPrompt:
      'The user is looking for past papers. Use findPastPapers; always surface direct download links plus course code / exam type / slot / year.',
  },
  memory: {
    id: 'memory',
    label: 'Memory',
    tools: ['contributeKnowledge'],
    systemPrompt:
      'Persist and recall user facts on demand. Explicitly confirm what you stored or retrieved.',
  },
  web: {
    id: 'web',
    label: 'Web',
    tools: ['google_search'],
    systemPrompt: 'Prefer fresh web sources. Cite the URLs you actually used.',
  },
  campus: {
    id: 'campus',
    label: 'Campus',
    tools: [
      'getMessMenu',
      'getPlacementInfo',
      'getSyllabus',
      'getCampusInfo',
      'getFacultyInfo',
      'searchRedditKnowledge',
      'searchRedditWithContext',
      'getRedditOverview',
    ],
    systemPrompt:
      'The user is asking about VIT campus life — mess menu, placements, syllabus, faculty, or community threads. Use the relevant tool directly.',
  },
} as const satisfies Record<string, GroupConfig>

export type GroupId = keyof typeof GROUPS

export function getGroupConfig(id: string | null | undefined): GroupConfig {
  if (!id) return GROUPS.general
  return (GROUPS as Record<string, GroupConfig>)[id] ?? GROUPS.general
}

/**
 * Map the user-facing `preferredTool` shortcut (as sent by the chat composer)
 * to a group id. Unknown values fall through to the general group so the
 * route keeps working with the full tool registry.
 */
export function preferredToolToGroupId(
  preferredTool?: string | null
): GroupId | null {
  if (!preferredTool) return null
  switch (preferredTool) {
    case 'web-search':
    case 'web':
      return 'web'
    case 'vtop':
    case 'queryVTOP':
      return 'vtop'
    case 'papers':
    case 'past-papers':
    case 'findPastPapers':
      return 'papers'
    case 'memory':
      return 'memory'
    case 'campus':
    case 'mess-menu':
    case 'getMessMenu':
    case 'placements':
      return 'campus'
    default:
      return null
  }
}
