'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root

const SheetContent = React.forwardRef<
  HTMLDivElement,
  SheetPrimitive.DialogContentProps & { side?: 'top' | 'bottom' | 'left' | 'right' }
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 bg-background border border-border rounded-t-2xl shadow-xl',
        side === 'bottom' && 'left-0 right-0 bottom-0 rounded-t-3xl',
        className
      )}
      {...props}
    >
      {children}
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-1.5 text-center sm:text-left', className)} {...props} />
)

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
  )
)
SheetTitle.displayName = SheetPrimitive.Title.displayName

export { Sheet, SheetContent, SheetHeader, SheetTitle }
