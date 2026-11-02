'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RefreshCw, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { readApiMessage, readJson } from '@/lib/http'
import { mgmtUsersResponseSchema, sendBriefingResponseSchema } from '@/types/api/mgmt'
import { errorMessage, type MgmtUser } from '../types'
import { useHydrationSafeField } from '@/lib/hydration-safe'

interface UsersListProps {
  onSelectUser?: (user: MgmtUser) => void
  onResetRateLimits?: (user: MgmtUser) => void
  resettingUserId?: string | null
}

export default function UsersList({
  onSelectUser,
  onResetRateLimits,
  resettingUserId,
}: UsersListProps) {
  const { id: queryInputId, value: query, setValue: setQuery } = useHydrationSafeField()
  const [users, setUsers] = useState<MgmtUser[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUsers = async (reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : users.length
      const res = await fetch(`/api/users?limit=25&offset=${offset}`)
      if (!res.ok) throw new Error('failed')
      const { users: items } = await readJson(res, mgmtUsersResponseSchema)
      setUsers(reset ? items : [...users, ...items])
      setHasMore(items.length === 25)
      setPage(reset ? 1 : page + 1)
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  const handleSendBriefing = async (user: MgmtUser) => {
    if (!user?.id && !user?.email) {
      toast.error('user record missing id/email')
      return
    }
    setSendingId(user.id ?? user.email ?? null)
    try {
      // Route groups like `(mgmt)` aren't part of the URL.
      const res = await fetch('/api/hub/send-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      })
      if (!res.ok) {
        const { error } = await readApiMessage(res)
        throw new Error(error || 'failed to send briefing')
      }
      const json = await readJson(res, sendBriefingResponseSchema)
      toast.success(
        json.briefing.scheduledAt
          ? `briefing scheduled for ${json.briefing.scheduledAt}`
          : 'briefing email sent'
      )
    } catch (error) {
      toast.error(errorMessage(error, 'failed to send briefing'))
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          id={queryInputId}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search by email or name"
        />
        <Button
          onClick={() => {
          }}
        >
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2 max-h-[48vh] overflow-auto pr-1">
        {users.filter(u => {
          if (!query) return true
          const q = query.toLowerCase()
          return (
            (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
          )
        }).length === 0 &&
          !loading && <div className="text-muted-foreground text-sm">no users</div>}
        {users
          .filter(u => {
            if (!query) return true
            const q = query.toLowerCase()
            return (
              (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
            )
          })
          .map((u: MgmtUser) => (
            <div
              key={u.id}
              className="rounded-md border border-border/30 p-3 flex items-center justify-between bg-black/10"
            >
              <div>
                <div className="font-medium">{u.name || u.email || 'Unknown'}</div>
                <div className="text-xs text-muted-foreground">{u.email || '—'}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onSelectUser?.(u)}>
                  view messages
                </Button>
                {onResetRateLimits && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResetRateLimits(u)}
                    disabled={resettingUserId === u.id}
                    className="gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {resettingUserId === u.id ? 'resetting…' : 'reset limits'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendBriefing(u)}
                  disabled={sendingId === (u.id || u.email)}
                  className="gap-1"
                >
                  {sendingId === (u.id || u.email) ? (
                    'sending…'
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> send briefing
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
      </div>

      <div className="flex justify-center">
        {hasMore ? (
          <Button onClick={() => fetchUsers(false)} disabled={loading}>
            {loading ? 'loading…' : 'load more'}
          </Button>
        ) : (
          users.length > 0 && <div className="text-xs text-muted-foreground">end of list</div>
        )}
      </div>
    </div>
  )
}
