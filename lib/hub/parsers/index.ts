import type { HubVTOPCommand } from '@/types/hub'
import { parseAttendance, type ParsedHubResult, type RawVTOPResult } from './attendance'

const PARSERS: Partial<Record<HubVTOPCommand, (result: RawVTOPResult) => ParsedHubResult | null>> = {
  attendance: parseAttendance,
}

export function parseHubCommandResult(command: HubVTOPCommand, payload: RawVTOPResult) {
  const parser = PARSERS[command]
  if (!parser) return null
  try {
    return parser(payload)
  } catch (error) {
    console.error(`[hub-parser] failed to parse ${command}:`, error)
    return null
  }
}
