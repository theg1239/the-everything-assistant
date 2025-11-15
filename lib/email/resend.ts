import { Resend } from 'resend'
import type { DailyBriefingMessage, DailyBriefingAction } from '@/lib/hub/daily-briefing'

const resendApiKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM || 'Everything Assistant <assistant@assist.nptelprep.in>'

const resendClient = resendApiKey ? new Resend(resendApiKey) : null

function buildBriefingHtml(
  greeting: string,
  messages: DailyBriefingMessage[],
  actions: DailyBriefingAction[]
) {
  const messageBlocks = messages
    .map(
      msg => `
        <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
          <div style="font-size:16px;font-weight:500;color:#f5f5f7;">${msg.primary}</div>
          ${msg.supporting ? `<div style="color:#a0a3ad;font-size:14px;margin-top:4px;">${msg.supporting}</div>` : ''}
        </div>
      `
    )
    .join('')

  const actionsBlock = actions.length
    ? `
      <div style="margin-top:24px;">
        <div style="text-transform:uppercase;font-size:12px;letter-spacing:0.2em;color:#7c7f91;margin-bottom:8px;">Suggested actions</div>
        ${actions
          .map(
            action => `
              <div style="display:inline-block;margin:4px 8px 4px 0;padding:6px 14px;border:1px solid rgba(255,255,255,0.2);border-radius:999px;font-size:12px;color:#e6e7eb;">
                ${action.label}
              </div>
            `
          )
          .join('')}
      </div>
    `
    : ''

  return `
    <div style="background:#06070b;color:#f5f5f7;padding:32px;font-family:'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="max-width:640px;margin:0 auto;">
        <h1 style="font-weight:400;font-size:28px;margin:0 0 8px 0;">${greeting.toLowerCase()}</h1>
        <p style="color:#9ca0b3;margin-bottom:24px;font-size:14px;">Here’s your Everything Assistant briefing.</p>
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:24px;background:rgba(255,255,255,0.02);">
          ${messageBlocks}
          ${actionsBlock}
        </div>
        <p style="color:#6b6f7f;font-size:12px;margin-top:32px;">You’re receiving this because briefing emails are enabled. Update preferences anytime from the hub.</p>
      </div>
    </div>
  `
}

function buildBriefingText(
  greeting: string,
  messages: DailyBriefingMessage[],
  actions: DailyBriefingAction[]
) {
  const lines = [greeting.toLowerCase(), '', ...messages.map(msg => `• ${msg.primary}${msg.supporting ? ` — ${msg.supporting}` : ''}`)]
  if (actions.length) {
    lines.push('', 'Suggested actions:')
    actions.forEach(action => lines.push(`- ${action.label}`))
  }
  return lines.join('\n')
}

export async function sendDailyBriefingEmail(opts: {
  to: string
  greeting: string
  messages: DailyBriefingMessage[]
  actions?: DailyBriefingAction[]
  scheduledAt?: string
}) {
  if (!resendClient) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  const actions = opts.actions || []
  const html = buildBriefingHtml(opts.greeting, opts.messages, actions)
  const text = buildBriefingText(opts.greeting, opts.messages, actions)

  const payload: Parameters<typeof resendClient.emails.send>[0] = {
    from: resendFrom,
    to: opts.to,
    subject: 'Your Everything Assistant briefing',
    html,
    text,
  }
  if (opts.scheduledAt) {
    payload.scheduledAt = opts.scheduledAt
  }
  return resendClient.emails.send(payload)
}
