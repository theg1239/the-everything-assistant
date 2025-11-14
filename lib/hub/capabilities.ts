import type { HubVTOPCommand } from '@/types/hub'

export type HubCapability = {
  command: HubVTOPCommand
  title: string
  description: string
  parser?: 'attendance'
  autoSync?: boolean
  requires?: {
    semester?: boolean
    course?: boolean
    faculty?: boolean
    fuzzyIndex?: boolean
    classGroup?: boolean
  }
  group: 'academics' | 'logistics' | 'documents'
}

const capabilityList: HubCapability[] = [
  {
    command: 'attendance',
    title: 'attendance autopilot',
    description: 'Slot-wise attendance + 75% guardrails.',
    parser: 'attendance',
    autoSync: true,
    requires: {
      semester: false,
    },
    group: 'academics',
  },
  {
    command: 'timetable',
    title: 'timetable pulse',
    description: 'Latest FFCS schedule and slot grid.',
    autoSync: true,
    requires: {
      semester: false,
    },
    group: 'academics',
  },
  {
    command: 'marks',
    title: 'marks ledger',
    description: 'Continuous assessment with semester filter.',
    autoSync: false,
    requires: {
      semester: true,
    },
    group: 'academics',
  },
  {
    command: 'grades',
    title: 'grade history',
    description: 'Past grade cards and satisfaction delta.',
    autoSync: false,
    requires: {
      semester: true,
    },
    group: 'academics',
  },
  {
    command: 'cgpa',
    title: 'cgpa trend',
    description: 'Cumulative GPA with semester deltas.',
    autoSync: false,
    group: 'academics',
  },
  {
    command: 'exams',
    title: 'exam schedule',
    description: 'Upcoming exam timetable snapshot.',
    autoSync: true,
    requires: {
      semester: true,
    },
    group: 'academics',
  },
  {
    command: 'course-page',
    title: 'course materials',
    description: 'CLI-TOP smart downloader for notes, slides, DAs.',
    autoSync: false,
    requires: {
      semester: true,
      course: true,
      faculty: true,
      fuzzyIndex: true,
    },
    group: 'documents',
  },
  {
    command: 'receipts',
    title: 'fee receipts',
    description: 'Official receipt PDFs and transaction refs.',
    autoSync: false,
    group: 'documents',
  },
  {
    command: 'library-dues',
    title: 'library dues',
    description: 'Books on hold, fine amounts, due dates.',
    autoSync: true,
    group: 'logistics',
  },
  {
    command: 'hostel',
    title: 'hostel info',
    description: 'Block, room, warden contacts straight from VTOP.',
    autoSync: false,
    group: 'logistics',
  },
  {
    command: 'nightslip',
    title: 'night slip',
    description: 'Request + approval feed.',
    autoSync: true,
    group: 'logistics',
  },
  {
    command: 'leave',
    title: 'leave status',
    description: 'Leave tracker with approvals and comments.',
    autoSync: true,
    group: 'logistics',
  },
  {
    command: 'msg',
    title: 'class messages',
    description: 'Latest announcements per course.',
    autoSync: true,
    group: 'academics',
  },
  {
    command: 'da',
    title: 'digital assignments',
    description: 'Submission deadlines + downloads.',
    autoSync: false,
    group: 'documents',
  },
  {
    command: 'facility',
    title: 'facility booking',
    description: 'Hostel facility registration status.',
    autoSync: false,
    group: 'logistics',
  },
  {
    command: 'syllabus',
    title: 'syllabus vault',
    description: 'Course PDF downloader with fuzzy search.',
    autoSync: false,
    group: 'documents',
  },
]

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
