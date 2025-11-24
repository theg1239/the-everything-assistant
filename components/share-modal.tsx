'use client'

import { useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SharePreviewCard, deriveSharePreview } from '@/components/share-preview-card'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Link2, Loader2, Share2, Linkedin, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { LegacyMessage } from '@/lib/ai-message-conversion'

interface ShareModalProps {
  chatId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  previewMessages?: LegacyMessage[]
}

function ShareContent({
  title,
  shareUrl,
  isLoading,
  onCopy,
  onNativeShare,
  onLinkedIn,
  onReddit,
  previewMessages,
  isMobile,
}: {
  title?: string
  shareUrl: string
  isLoading: boolean
  onCopy: () => void
  onNativeShare: () => void
  onLinkedIn: () => void
  onReddit: () => void
  previewMessages: LegacyMessage[]
  isMobile?: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <DialogTitle className="text-2xl font-semibold tracking-tight">{title || 'Share chat'}</DialogTitle>
      </div>

      <div className={isMobile ? 'max-h-[30vh] overflow-y-auto' : ''}>
        <SharePreviewCard title={title || 'Shared chat'} messages={previewMessages} hideTitle />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button
          variant="secondary"
          className="w-full justify-center"
          onClick={onCopy}
          disabled={!shareUrl || isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {isLoading ? 'preparing…' : 'copy link'}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-center"
          onClick={onNativeShare}
          disabled={!shareUrl || isLoading}
        >
          <Share2 className="h-4 w-4" />
          share
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-center"
          onClick={onLinkedIn}
          disabled={!shareUrl || isLoading}
        >
          <Linkedin className="h-4 w-4" />
          linkedin
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-center"
          onClick={onReddit}
          disabled={!shareUrl || isLoading}
        >
          <Send className="h-4 w-4" />
          reddit
        </Button>
      </div>

      {shareUrl && (
        <div className="rounded-xl border border-white/10 bg-muted/30 px-4 py-3 text-xs text-muted-foreground break-all">
          {shareUrl}
        </div>
      )}
    </div>
  )
}

export function ShareModal({
  chatId,
  open,
  onOpenChange,
  title,
  previewMessages = [],
}: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastFetchedChatId, setLastFetchedChatId] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    setShareUrl('')
    setLastFetchedChatId(null)
  }, [chatId])

  const preview = useMemo(() => deriveSharePreview(previewMessages), [previewMessages])

  useEffect(() => {
    if (!open) return
    if (!chatId) {
      toast.error('chat is still spinning up—try again after the first reply.')
      onOpenChange(false)
      return
    }
    if (lastFetchedChatId === chatId && shareUrl) return

    const createShare = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/chats/${chatId}/share`, { method: 'POST' })
        if (res.status === 401) {
          toast.error('sign in to share this chat.')
          onOpenChange(false)
          return
        }
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'failed to create share link')
        }
        const data = (await res.json()) as { shareUrl?: string }
        if (data.shareUrl) {
          setShareUrl(data.shareUrl)
          setLastFetchedChatId(chatId)
        }
      } catch (error) {
        console.error('failed to create share link', error)
        toast.error('could not generate a share link. please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    createShare()
  }, [open, chatId, lastFetchedChatId, shareUrl, onOpenChange])

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('link copied')
    } catch {
      toast.error('could not copy—please copy manually')
    }
  }

  const handleNativeShare = async () => {
    if (!shareUrl) return
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: title || 'shared chat',
          text: preview.question || 'Check out this conversation',
          url: shareUrl,
        })
        return
      } catch {
        // fallback to copy
      }
    }
    handleCopy()
  }

  const handleLinkedIn = () => {
    if (!shareUrl) return
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleReddit = () => {
    if (!shareUrl) return
    const url = `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title || 'Shared chat')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const content = (
    <ShareContent
      title={title}
      shareUrl={shareUrl}
      isLoading={isLoading}
      onCopy={handleCopy}
      onNativeShare={handleNativeShare}
      onLinkedIn={handleLinkedIn}
      onReddit={handleReddit}
      previewMessages={previewMessages}
      isMobile={isMobile}
    />
  )

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <Drawer.Content
            aria-label="Share chat"
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[85vh] rounded-t-3xl border border-border/50 bg-background/95 p-5 shadow-2xl"
          >
            <div className="mx-auto max-w-xl flex flex-col max-h-[calc(85vh-40px)]">
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border/60 flex-shrink-0" />
              <div className="overflow-y-auto flex-1 min-h-0">
                {content}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border border-white/10 bg-background/95 text-foreground p-6 shadow-2xl backdrop-blur">
        {content}
      </DialogContent>
    </Dialog>
  )
}
