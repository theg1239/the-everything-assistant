export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type FacultyCourseRecord = {
  code?: string
  title?: string
  slot?: string
  venue?: string
  type?: string
}

export type FacultyMemberRecord = {
  name?: string
  department?: string
  designation?: string
  email?: string
  phone?: string
  slot?: string
  room?: string
  profile_url?: string
  profileUrl?: string
  image_url?: string
  image?: string
  courses?: FacultyCourseRecord[]
} & Record<string, JsonValue | undefined>

export type FacultyDepartmentRecord = {
  name?: string
  department?: string
  url?: string
  faculty?: FacultyMemberRecord[]
}

export type FacultySchoolRecord = {
  school?: string
  departments?: FacultyDepartmentRecord[]
}

export type FacultyResultEntry = {
  name?: string
  department?: string
  school?: string
  email?: string
  profileUrl?: string
  image?: string
  courses?: FacultyCourseRecord[]
} & Record<string, JsonValue | undefined>

export type SyllabusEntry =
  | string
  | {
      code?: string
      title?: string
      file?: string
      filename?: string
    }

export type VtopCommandFlags = Record<string, string | number | boolean | undefined>

export interface VtopInteractiveRequestBody {
  command: string
  username: string
  step: string
  password?: string
  encryptedPassword?: string
  sessionKey?: string
  flags: VtopCommandFlags
}

export interface VtopRequestBody {
  command: string
  username: string
  password?: string
  encryptedPassword?: string
  sessionKey?: string
  flags: VtopCommandFlags
}

export type ToolInvocationState = 'partial-call' | 'call' | 'result' | 'error' | string

export interface ToolInvocation {
  toolName: string
  toolCallId?: string
  args?: Record<string, JsonValue | undefined>
  input?: Record<string, JsonValue | undefined>
  output?: JsonValue
  result?: JsonValue
  state?: ToolInvocationState
  error?: string
  hidden?: boolean
  providerExecuted?: boolean
  meta?: Record<string, JsonValue | undefined>
}
