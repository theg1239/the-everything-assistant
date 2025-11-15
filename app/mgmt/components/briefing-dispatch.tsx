'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Mail, CalendarClock, Send } from 'lucide-react'

export default function BriefingDispatch() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<null | {
    email: string
    greeting: string
    messages: number
    actions: number
    scheduledAt: string | null
    referenceTime: string
  }>(null)

  const handleSend = async () => {
    if (!email.trim() && !userId.trim()) {
      toast.error('enter a user email or id first')
      return
    }
    setLoading(true)
    try {
      const payload: Record<string, string> = {}
      if (email.trim()) payload.email = email.trim()
      if (userId.trim()) payload.userId = userId.trim()
      if (scheduledAt.trim()) payload.scheduledAt = scheduledAt.trim()
      const res = await fetch('/api/(mgmt)/hub/send-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'failed to send briefing')
      }
      setLastResult({
        email: json.user?.email,
        greeting: json.briefing?.greeting,
        messages: json.briefing?.messages ?? 0,
        actions: json.briefing?.actions ?? 0,
        scheduledAt: json.briefing?.scheduledAt ?? null,
        referenceTime: json.briefing?.referenceTime,
      })
      toast.success(
        json.briefing?.scheduledAt
          ? `briefing scheduled for ${json.briefing.scheduledAt}`
          : 'briefing email dispatched'
      )
    } catch (error: any) {
      console.error('[mgmt] briefing dispatch failed', error)
      toast.error(error?.message || 'failed to send briefing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/30 bg-black/20 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 text-lg font-semibold lowercase mb-4">
        <Mail className="h-5 w-5" /> dispatch daily briefing
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        send the latest hub briefing to any user. schedule using natural language like
        <span className="font-medium"> “tomorrow 7am”</span> or provide an ISO timestamp.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">user email</label>
          <Input
            placeholder="person@university.edu"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="lowercase"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">user id (optional)</label>
          <Input
            placeholder="uuid..."
            value={userId}
            onChange={e => setUserId(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> schedule (optional)
          </label>
          <Input
            placeholder="today 9am / 2025-11-16T04:00:00Z"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button onClick={handleSend} disabled={loading} className="rounded-full gap-2">
          {loading ? (
            'sending…'
          ) : (
            <>
              <Send className="h-4 w-4" /> send briefing
            </>
          )}
        </Button>
      </div>
      {lastResult && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                last dispatch
              </p>
              <p className="font-semibold text-white">{lastResult.email}</p>
              <p className="text-xs text-muted-foreground">{lastResult.greeting}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>messages • {lastResult.messages}</div>
              <div>actions • {lastResult.actions}</div>
              <div>
                schedule • {lastResult.scheduledAt ? lastResult.scheduledAt : 'now'}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            reference {new Date(lastResult.referenceTime).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}
