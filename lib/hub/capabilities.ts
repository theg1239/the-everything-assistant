import capabilityManifest from '@/hub-capabilities.json'
import type { HubVTOPCommand } from '@/types/hub'

export type HubCapability = {
  command: HubVTOPCommand
  cliCommand: string
  title: string
  description: string
  group: 'academics' | 'logistics' | 'documents'
  autoSync?: boolean
  parser?: string
  insights?: string[]
  flags?: {
    semester?: boolean
    course?: boolean
    faculty?: boolean
    fuzzyIndex?: boolean
    classGroup?: boolean
  }
  interactive?: {
    requiresSemester?: boolean
    requiresCourse?: boolean
    requiresFaculty?: boolean
    requiresClassGroup?: boolean
    autoCtrlC?: boolean
  }
}

const capabilityList = (capabilityManifest as HubCapability[]).map(cap => ({
  ...cap,
  cliCommand: cap.cliCommand || cap.command,
}))

const capabilityMap: Partial<Record<HubVTOPCommand, HubCapability>> = capabilityList.reduce(
  (acc, capability) => {
    acc[capability.command] = capability
    return acc
  },
  {} as Partial<Record<HubVTOPCommand, HubCapability>>
)

export function getHubCapability(command: HubVTOPCommand) {
  return capabilityMap[command]
}

export function listHubCapabilities() {
  return capabilityList
}
