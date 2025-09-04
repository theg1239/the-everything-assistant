'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export default function MessagesViewerDialog({
  viewerOpen,
  setViewerOpen,
  viewerLoading,
  viewerError,
  viewerData,
}: any) {
  return (
    <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="lowercase">chat messages</DialogTitle>
          <DialogDescription className="lowercase">
            {viewerData?.chatId ? `chat id: ${viewerData.chatId}` : '—'}
            {viewerData?.user && (
              <span className="block mt-1">
                user: {viewerData.user.name || viewerData.user.email || 'Unknown'}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {viewerLoading && <div className="text-muted-foreground text-sm">loading messages…</div>}
          {viewerError && <div className="text-destructive text-sm">{viewerError}</div>}
          {!viewerLoading && !viewerError && viewerData?.messages?.length === 0 && (
            <div className="text-muted-foreground text-sm">no messages</div>
          )}
          {!viewerLoading &&
            !viewerError &&
            viewerData?.messages?.map((m: any) => (
              <div key={m.id} className="rounded-md border border-border/30 p-3 bg-black/20">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      m.role === 'user'
                        ? 'bg-blue-500/20 text-blue-200'
                        : 'bg-green-500/20 text-green-200'
                    )}
                  >
                    {m.role}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString?.() || ''}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
