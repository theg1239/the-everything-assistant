'use client'

import { ThemeToggle } from './theme-toggle'

export function PapersHeader() {
  return (
    <header className="border-b border-border/60 bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">paper vault</p>
          <h1 className="text-2xl font-semibold text-foreground">Papers</h1>
          <p className="text-sm text-muted-foreground">
            Minimal, clean surface just like the chat interface.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
