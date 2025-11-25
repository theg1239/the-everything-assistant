'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HamburgerButtonProps {
  onClick: React.MouseEventHandler<HTMLButtonElement>
  className?: string
}

export function HamburgerButton({ onClick, className = '' }: HamburgerButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        'h-9 w-9 border border-border/60 hover:bg-border/10 text-foreground',
        className
      )}
    >
      <Menu className="h-4 w-4" />
    </Button>
  )
}
