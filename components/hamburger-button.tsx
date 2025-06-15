'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

interface HamburgerButtonProps {
  onClick: () => void
  className?: string
}

export function HamburgerButton({ onClick, className = '' }: HamburgerButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={`text-foreground hover:bg-muted ${className}`}
      style={{
        zIndex: 100,
        position: 'relative',
        minWidth: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid hsl(var(--border))',
      }}
    >
      {' '}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="18" x2="20" y2="18"></line>
      </svg>
    </Button>
  )
}
