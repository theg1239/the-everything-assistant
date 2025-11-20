'use client'

import { memo } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ScrollToLatestProps {
  visible: boolean
  onClick: () => void
}

export const ScrollToLatest = memo(({ visible, onClick }: ScrollToLatestProps) => {
  if (!visible) return null

  return (
    <div className="fixed bottom-20 right-4 md:right-8 z-40">
      <Button
        size="sm"
        variant="secondary"
        onClick={onClick}
        className={cn(
          'shadow-lg rounded-full px-3 h-10 flex items-center gap-2 bg-background/90 border border-border/70 backdrop-blur',
          'hover:translate-y-[-1px] transition-transform'
        )}
        aria-label="Scroll to latest message"
      >
        <ArrowDown className="h-4 w-4" />
        <span className="text-xs font-semibold">latest</span>
      </Button>
    </div>
  )
})

ScrollToLatest.displayName = 'ScrollToLatest'
