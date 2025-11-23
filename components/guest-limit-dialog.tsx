'use client'

import { signIn } from 'next-auth/react'
import { LogIn, ShieldAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface GuestLimitDialogProps {
  open: boolean
  onClose: () => void
  remainingMessages?: number
}

export function GuestLimitDialog({ open, onClose, remainingMessages = 0 }: GuestLimitDialogProps) {
  const remainingLabel =
    remainingMessages <= 0
      ? 'no messages left'
      : `${remainingMessages} message${remainingMessages === 1 ? '' : 's'} left`

  return (
    <Dialog open={open} onOpenChange={next => (!next ? onClose() : null)}>
      <DialogContent className="border border-border/60 bg-background/90 backdrop-blur-xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-left">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            sign in to keep chatting
          </DialogTitle>
          <DialogDescription className="text-left">
            you&apos;ve hit the 2-message guest preview. sign in and we&apos;ll move this conversation
            into your account automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">guest mode</span>{' '}
            <span className="mx-1 text-muted-foreground/60">•</span>
            <span className={cn('font-medium', remainingMessages <= 0 ? 'text-amber-400' : 'text-foreground')}>
              {remainingLabel}
            </span>{' '}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1"
              onClick={() => signIn('google', { callbackUrl: '/' })}
            >
              <LogIn className="h-4 w-4 mr-2" />
              sign in with google
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              maybe later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
