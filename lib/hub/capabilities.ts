import capabilityManifest from '@/hub-capabilities.json'
import * as z from 'zod'
import { HUB_COMMANDS, type HubVTOPCommand } from '@/types/hub'

const hubCapabilitySchema = z.object({
  command: z.enum(HUB_COMMANDS),
  cliCommand: z.string(),
  title: z.string(),
  description: z.string(),
  group: z.enum(['academics', 'logistics', 'documents', 'hub']),
  autoSync: z.boolean().optional(),
  /** Supported by the proxy's batched `/sync` (one login for many commands). */
  sync: z.boolean().optional(),
  parser: z.string().optional(),
  insights: z.array(z.string()).optional(),
  flags: z
    .object({
      semester: z.boolean().optional(),
      course: z.boolean().optional(),
      faculty: z.boolean().optional(),
      fuzzyIndex: z.boolean().optional(),
      classGroup: z.boolean().optional(),
    })
    .optional(),
  interactive: z
    .object({
      requiresSemester: z.boolean().optional(),
      requiresCourse: z.boolean().optional(),
      requiresFaculty: z.boolean().optional(),
      requiresClassGroup: z.boolean().optional(),
      autoCtrlC: z.boolean().optional(),
    })
    .optional(),
})

export type HubCapability = z.infer<typeof hubCapabilitySchema>

const capabilityList: HubCapability[] = z
  .array(hubCapabilitySchema)
  .parse(capabilityManifest)
  .map(cap => ({
    ...cap,
    cliCommand: cap.cliCommand || cap.command,
  }))

const capabilityMap: Partial<Record<HubVTOPCommand, HubCapability>> = {}
for (const capability of capabilityList) {
  capabilityMap[capability.command] = capability
}

export function getHubCapability(command: HubVTOPCommand) {
  return capabilityMap[command]
}

export function listHubCapabilities() {
  return capabilityList
}
