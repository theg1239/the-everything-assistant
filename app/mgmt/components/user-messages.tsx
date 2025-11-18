'use client'

import React, { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { readJson } from '@/lib/http'

type UserSummary = { id: string; name?: string | null; email?: string | null }
type UserMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

interface UserMessagesProps {
  user?: UserSummary | null
  onClose?: () => void
}

export default function UserMessages({ user, onClose }: UserMessagesProps) {
  const [q, setQ] = useState('')
  const [messages, setMessages] = useState<UserMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 30
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchMessages(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchMessages = async (reset = false) => {
    if (!user) return
    setLoading(true)
    try {
      const off = reset ? 0 : offset
      const res = await fetch(
        `/api/user-messages?userId=${encodeURIComponent(user.id)}&limit=${limit}&offset=${off}`
      )
      if (!res.ok) throw new Error('failed')
      const json = await readJson<{ messages?: UserMessage[] }>(res)
      const items = json.messages || []
      setMessages(reset ? items : [...messages, ...items])
      setHasMore(items.length === limit)
      setOffset(reset ? limit : off + items.length)
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{user?.name || user?.email || 'User'}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            close
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e: any) => setQ(e.target.value)}
          placeholder="search message text"
        />
        <Button onClick={() => fetchMessages(true)}>search</Button>
      </div>

      <div className="space-y-2 max-h-[56vh] overflow-auto pr-1">
        {loading && messages.length === 0 && (
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> loading…
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-muted-foreground text-sm">no messages</div>
        )}
        {messages
          .filter(m => {
            if (!q) return true
            return (m.content || '').toLowerCase().includes(q.toLowerCase())
          })
          .map((m: any) => (
            <div key={m.id} className="rounded-md border border-border/30 p-3 bg-black/10">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">{m.role || 'message'}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString?.() || ''}
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
            </div>
          ))}
      </div>

      <div className="flex justify-center">
        {hasMore ? (
          <Button onClick={() => fetchMessages(false)} disabled={loading}>
            {loading ? 'loading…' : 'load more'}
          </Button>
        ) : (
          messages.length > 0 && <div className="text-xs text-muted-foreground">end of results</div>
        )}
      </div>
    </div>
  )
}
