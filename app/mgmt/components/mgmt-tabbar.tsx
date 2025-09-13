'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Activity, Send, Key, Database, Users } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

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
    <div className="mt-4">
      <div className="sm:hidden">
        <Select value={active} onValueChange={v => onChange?.(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="tab" />
          </SelectTrigger>
          <SelectContent>
            {tabs.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav
        className="hidden sm:flex mt-2 gap-2 overflow-x-auto snap-x snap-mandatory touch-pan-x py-1"
        aria-label="management tabs"
      >
        {tabs.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          const base = 'gap-2 lowercase flex items-center snap-start'
          const activeClasses = 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
          const inactiveClasses = 'bg-transparent text-muted-foreground hover:bg-white/3'
          return (
            <Button
              key={t.id}
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onChange?.(t.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`${base} ${isActive ? activeClasses : inactiveClasses} px-3 py-2 min-w-[96px] sm:min-w-[120px]`}
            >
              <Icon className={'w-4 h-4 ' + (isActive ? 'text-white' : 'text-muted-foreground')} />
              {/* hide full label on very small sm screens, show on md+ */}
              <span className="text-sm hidden md:inline">{t.label}</span>
              {/* show small label under icon for sm screens if needed */}
              <span className="text-xs md:hidden inline">{t.label.split(' ')[0]}</span>
            </Button>
          )
        })}
      </nav>
    </div>
  )
}
