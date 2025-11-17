'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import type { HubVTOPCommand } from '@/types/hub'
import type { HubCapability } from '@/lib/hub/capabilities'
import { RefreshCcw, Clock3 } from 'lucide-react'

export type MinimalStatusCardProps = {
  terseName: string
  syncing: boolean
  syncCommand: HubVTOPCommand | null
  lastSyncedLabel: string
  onSync: () => void
  onRefresh: () => void
  quickCaps: HubCapability[]
  onCapability: (capability: HubCapability) => void
  loadingCommand: HubVTOPCommand | null
  disabled: boolean
  linked: boolean
  onLink?: () => void
  emailEnabled?: boolean
  emailLabel?: string
  onSendEmail?: () => void
  sendingEmail?: boolean
}

export const MinimalStatusCard = memo(function MinimalStatusCard({
  terseName,
  syncing,
  syncCommand,
  lastSyncedLabel,
  onSync,
  onRefresh,
  quickCaps,
  onCapability,
  loadingCommand,
  disabled,
  linked,
  onLink,
  emailEnabled,
  emailLabel,
  onSendEmail,
  sendingEmail,
}: MinimalStatusCardProps) {
  return (
    <div className="rounded-3xl sm:rounded-[32px] border border-white/10 bg-[rgba(7,8,16,0.8)] backdrop-blur-xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-[0_15px_50px_rgba(0,0,0,0.45)] sm:shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 sm:text-[11px] sm:tracking-[0.3em]">hub status</div>
      <div className="space-y-2">
        <p className="text-sm text-white/70">hey {terseName},</p>
        <div className="text-2xl sm:text-3xl font-light text-white leading-snug">
          {syncing && syncCommand ? `syncing ${syncCommand.replace('-', ' ')}` : 'standing by'}
        </div>
        <div className="text-xs text-white/60">
          {syncing ? 'streaming live' : `last synced ${lastSyncedLabel}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSync} disabled={syncing} className="rounded-full px-5">
          <RefreshCcw className="h-4 w-4 mr-2" />
          {syncing ? 'syncing…' : 'sync now'}
        </Button>
        <Button
          variant="ghost"
          onClick={onRefresh}
          disabled={syncing}
          className="rounded-full px-5 text-white/80 hover:text-white"
        >
          <Clock3 className="h-4 w-4 mr-2" />
          reload cache
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
        <span className={linked ? 'text-emerald-300' : 'text-amber-300'}>
          {linked ? 'vtop linked' : 'vtop not linked'}
        </span>
        {!linked && onLink && (
          <button className="underline-offset-4 underline text-white/70 hover:text-white" onClick={onLink}>
            link now
          </button>
        )}
      </div>
      {quickCaps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickCaps.map(cap => (
            <button
              key={cap.command}
              onClick={() => onCapability(cap)}
              disabled={disabled || loadingCommand === cap.command}
              className="text-[11px] uppercase tracking-[0.3em] rounded-full border border-white/15 px-3 py-1 text-white/70 hover:text-white/100 hover:border-white/40 disabled:opacity-60"
            >
              {loadingCommand === cap.command ? 'running…' : cap.command}
            </button>
          ))}
        </div>
      )}
      {emailEnabled && emailLabel && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
          <span className="text-left">{emailLabel}</span>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full px-3 py-1 text-[11px]"
            disabled={sendingEmail}
            onClick={onSendEmail}
          >
            {sendingEmail ? 'sending…' : 'email briefing now'}
          </Button>
        </div>
      )}
    </div>
  )
})
