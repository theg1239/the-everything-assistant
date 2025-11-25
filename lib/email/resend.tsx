import React, { type CSSProperties } from 'react'
import { Resend } from 'resend'
import type { DailyBriefingMessage, DailyBriefingAction } from '@/lib/hub/daily-briefing'
import {
  HUB_BRIEFING_ACTION_PARAM,
  HUB_BRIEFING_TRIGGER_PARAM,
  HUB_BRIEFING_TRIGGER_VALUE,
  HUB_BRIEFING_UTM,
} from '@/lib/hub/constants'
import { HUB_COMMANDS, type HubVTOPCommand } from '@/types/hub'

const resendApiKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM || 'Everything Assistant <assistant@assist.nptelprep.in>'
const resendClient = resendApiKey ? new Resend(resendApiKey) : null
const FALLBACK_APP_URL = 'https://everything-assistant.com'

type SendableDailyBriefingAction = Partial<DailyBriefingAction> & { label: string }

type NormalizedMessage = DailyBriefingMessage & {
  id: string
  primary: string
  supporting?: string
}

type NormalizedAction = {
  id: string
  label: string
  command?: HubVTOPCommand
  href: string
}

const UTC_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

const STAT_STYLES: CSSProperties = {
  textTransform: 'uppercase',
  fontSize: '11px',
  letterSpacing: '0.2em',
  color: '#8f94a8',
  margin: 0,
}

function sanitizeCopy(value?: string | null) {
  if (!value) return ''
  return value
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeMessages(messages: DailyBriefingMessage[]): NormalizedMessage[] {
  return messages.map((msg, index) => ({
    ...msg,
    id: msg.id || `message-${index + 1}`,
    primary: sanitizeCopy(msg.primary) || 'hub update',
    supporting: msg.supporting ? sanitizeCopy(msg.supporting) : undefined,
  }))
}

function ensureAbsoluteUrl(value?: string | null) {
  if (!value) return FALLBACK_APP_URL
  const trimmed = value.trim()
  if (!trimmed) return FALLBACK_APP_URL
  const hasProtocol = /^https?:\/\//i.test(trimmed)
  const normalized = trimmed.replace(/\/$/, '')
  return hasProtocol ? normalized : `https://${normalized}`
}

function resolveAppBaseUrl() {
  const candidate =
    process.env.BRIEFING_APP_URL ||
    process.env.RESEND_BRIEFING_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.MAIN_APP_URL ||
    process.env.APP_URL
  return ensureAbsoluteUrl(candidate)
}

function buildActionUrl(baseUrl: string, command?: HubVTOPCommand) {
  const url = new URL(baseUrl)
  url.pathname = '/'
  url.searchParams.set(HUB_BRIEFING_TRIGGER_PARAM, HUB_BRIEFING_TRIGGER_VALUE)
  if (command) {
    url.searchParams.set(HUB_BRIEFING_ACTION_PARAM, command)
  }
  url.searchParams.set('utm_source', HUB_BRIEFING_UTM.source)
  url.searchParams.set('utm_medium', HUB_BRIEFING_UTM.medium)
  url.searchParams.set('utm_campaign', HUB_BRIEFING_UTM.campaign)
  return url.toString()
}

function normalizeActions(
  actions: SendableDailyBriefingAction[],
  baseUrl: string
): NormalizedAction[] {
  return actions
    .filter(action => Boolean(action && action.label))
    .map((action, index) => {
      const label = sanitizeCopy(action.label) || 'Open hub'
      const command =
        action.command && HUB_COMMANDS.includes(action.command) ? action.command : undefined
      return {
        id: action.id || `action-${index + 1}`,
        label,
        command,
        href: buildActionUrl(baseUrl, command),
      }
    })
}

function formatGreetingCopy(raw: string) {
  const safe = sanitizeCopy(raw) || 'good morning'
  return safe.charAt(0).toUpperCase() + safe.slice(1)
}

function formatDeliveredLabel(date: Date) {
  return UTC_FORMATTER.format(date)
}

function buildBriefingText(
  greeting: string,
  messages: NormalizedMessage[],
  actions: NormalizedAction[],
  deliveredAt: Date,
  baseUrl: string
) {
  const lines = [greeting, `Generated ${deliveredAt.toUTCString()}`, '']
  lines.push('Updates:')
  messages.forEach((message, index) => {
    const supporting = message.supporting ? ` | ${message.supporting}` : ''
    lines.push(`${index + 1}. ${message.primary}${supporting}`)
  })
  if (actions.length) {
    lines.push('', 'Quick actions:')
    actions.forEach(action => lines.push(`- ${action.label}: ${action.href}`))
  } else {
    lines.push('', `Open hub: ${baseUrl}`)
  }
  lines.push('', 'Manage briefing preferences inside the Everything Assistant hub settings.')
  return lines.join('\n')
}

type DailyBriefingEmailProps = {
  greeting: string
  deliveredLabel: string
  messages: NormalizedMessage[]
  actions: NormalizedAction[]
  appBaseUrl: string
}

function DailyBriefingEmail({
  greeting,
  deliveredLabel,
  messages,
  actions,
  appBaseUrl,
}: DailyBriefingEmailProps) {
  const hasMessages = messages.length > 0
  return (
    <div
      style={{
        backgroundColor: '#06070b',
        padding: '32px 16px',
        color: '#f5f5f7',
        fontFamily:
          "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '28px',
            padding: '32px',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <p style={{ ...STAT_STYLES, marginBottom: '10px', color: '#9ca0b3' }}>
            everything assistant briefing
          </p>
          <h1 style={{ fontWeight: 400, fontSize: '28px', margin: '0 0 6px 0' }}>{greeting}</h1>
          <p
            style={{ margin: '0 0 18px 0', color: '#b0b4c3', fontSize: '15px', lineHeight: '22px' }}
          >
            Here is your morning snapshot. Generated {deliveredLabel}.
          </p>
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '20px',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            {hasMessages ? (
              messages.map((message, index) => {
                const toneColor =
                  message.tone === 'alert'
                    ? '#ffb08a'
                    : message.tone === 'calm'
                      ? '#a0a6ba'
                      : '#f5f5f7'
                return (
                  <div
                    key={message.id}
                    style={{
                      padding: '12px 0',
                      borderBottom:
                        index === messages.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 500,
                        lineHeight: '24px',
                        color: toneColor,
                      }}
                    >
                      {message.primary}
                    </p>
                    {message.supporting && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '14px',
                          color: '#a0a3ad',
                          lineHeight: '20px',
                        }}
                      >
                        {message.supporting}
                      </p>
                    )}
                  </div>
                )
              })
            ) : (
              <div>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>
                  no fresh hub updates yet.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#a0a3ad' }}>
                  trigger a sync from the hub to populate this briefing.
                </p>
              </div>
            )}
            {actions.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <p style={{ ...STAT_STYLES, marginBottom: '10px' }}>quick actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {actions.map(action => (
                    <a
                      key={action.id}
                      href={action.href}
                      style={{
                        display: 'inline-block',
                        padding: '8px 16px',
                        borderRadius: '999px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '13px',
                        color: '#f5f5f7',
                        textDecoration: 'none',
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {actions.length === 0 && (
              <div style={{ marginTop: '18px' }}>
                <p style={{ ...STAT_STYLES, marginBottom: '6px' }}>quick actions</p>
                <a
                  href={buildActionUrl(appBaseUrl)}
                  style={{ fontSize: '13px', color: '#9fb4ff', textDecoration: 'underline' }}
                >
                  open the hub to trigger a sync
                </a>
              </div>
            )}
          </div>
          <p style={{ margin: '20px 0 0', fontSize: '12px', color: '#6b6f7f' }}>
            You are receiving this email because briefing emails are enabled. Update timing and
            inbox preferences anytime from the hub settings.
          </p>
        </div>
      </div>
    </div>
  )
}

export async function sendDailyBriefingEmail(opts: {
  to: string
  greeting: string
  messages: DailyBriefingMessage[]
  actions?: SendableDailyBriefingAction[]
  scheduledAt?: string
}) {
  if (!resendClient) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const baseUrl = resolveAppBaseUrl()
  const deliveredAt = new Date()
  const normalizedMessages = normalizeMessages(opts.messages)
  const normalizedActions = normalizeActions(opts.actions || [], baseUrl)
  const greetingCopy = formatGreetingCopy(opts.greeting)
  const deliveredLabel = formatDeliveredLabel(deliveredAt)

  const text = buildBriefingText(
    greetingCopy,
    normalizedMessages,
    normalizedActions,
    deliveredAt,
    baseUrl
  )

  const payload: Parameters<typeof resendClient.emails.send>[0] = {
    from: resendFrom,
    to: opts.to,
    subject: 'Your Everything Assistant briefing',
    react: (
      <DailyBriefingEmail
        greeting={greetingCopy}
        deliveredLabel={deliveredLabel}
        messages={normalizedMessages}
        actions={normalizedActions}
        appBaseUrl={baseUrl}
      />
    ),
    text,
  }

  if (opts.scheduledAt) {
    payload.scheduledAt = opts.scheduledAt
  }

  return resendClient.emails.send(payload)
}
