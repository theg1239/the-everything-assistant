"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Activity, Send, Key, Database, Users } from 'lucide-react'

export default function MgmtTabBar({ active, onChange }: any) {
  const tabs = [
    { id: 'overview', label: 'overview', icon: Activity },
    { id: 'tokens', label: 'token usage', icon: Activity },
    { id: 'broadcasts', label: 'broadcasts', icon: Send },
    { id: 'keys', label: 'api keys', icon: Key },
    { id: 'stats', label: 'stats', icon: Database },
    { id: 'users', label: 'users', icon: Users },
  ]

  return (
    <nav className="mt-4 flex gap-2 overflow-auto" aria-label="management tabs">
      {tabs.map((t) => {
        const Icon = t.icon
        const isActive = active === t.id
        const base = 'gap-2 lowercase flex items-center'
        const activeClasses = 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
        const inactiveClasses = 'bg-transparent text-muted-foreground hover:bg-white/3'
        return (
          <Button
            key={t.id}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange?.(t.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`${base} ${isActive ? activeClasses : inactiveClasses}`}
          >
            <Icon className={"w-4 h-4 " + (isActive ? 'text-white' : 'text-muted-foreground')} />
            <span className="text-sm">{t.label}</span>
          </Button>
        )
      })}
    </nav>
  )
}
