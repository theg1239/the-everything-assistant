'use client'

export type HubToolRunState<T = any> = {
  loading: boolean
  error: string | null
  result: T | null
}

export type HubPanelProps = {
  onRun?: () => void
}
