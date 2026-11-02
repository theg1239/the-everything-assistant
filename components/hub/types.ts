'use client'

export type HubToolArgs = Record<string, unknown>

export type HubToolRunState<T = unknown> = {
  loading: boolean
  error: string | null
  result: T | null
}

export type HubPanelProps = {
  onRun?: () => void
}
