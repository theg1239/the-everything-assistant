'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Wrench, Search, FileText, GraduationCap, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Tool {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

const availableTools: Tool[] = [
  {
    id: 'reddit-search',
    name: 'search reddit',
    description: 'Search Reddit knowledge base for student discussions and academic advice',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    id: 'vtop-query',
    name: 'VTOP access',
    description: 'Access personal VTOP data like grades, attendance, and timetable',
    icon: <GraduationCap className="w-4 h-4" />,
  },
  {
    id: 'past-papers',
    name: 'past papers',
    description: 'Find past examination papers for VIT courses',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    id: 'mess-menu',
    name: 'mess menu',
    description: 'Get mess menu for VIT hostels',
    icon: <Search className="w-4 h-4" />,
  },
]

interface ToolsDropdownProps {
  onToolSelect?: (toolId: string) => void
  selectedTool?: string
}

export function ToolsDropdown({ onToolSelect, selectedTool }: ToolsDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0 })
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  React.useEffect(() => {
    if (isOpen && buttonRef.current && mounted) {
      const buttonRect = buttonRef.current.getBoundingClientRect()

      // Position dropdown above and to the left of the button
      const dropdownHeight = 180 // Approximate height for the dropdown
      const dropdownWidth = 240

      // Position above the button with some gap
      let top = buttonRect.top - dropdownHeight - 8 // 8px gap above button

      // Position to the left (right-align dropdown to button's right edge)
      let left = buttonRect.right - dropdownWidth

      // If dropdown would go off screen at the top, position it below instead
      if (top < 8) {
        top = buttonRect.bottom + 8 // 8px gap below button
      }

      // Ensure dropdown doesn't go off screen horizontally to the left
      if (left < 8) {
        left = 8
      }

      // Ensure dropdown doesn't go off screen horizontally to the right
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8
      }

      setDropdownPosition({ top, left })
    }
  }, [isOpen, mounted])
  const handleToolSelect = (toolId: string) => {
    onToolSelect?.(toolId)
    setIsOpen(false)
  }

  const selectedToolData = availableTools.find(tool => tool.id === selectedTool)

  return (
    <div className="relative">
      <TooltipProvider>
        {' '}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={buttonRef}
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                'h-8 px-2 text-muted-foreground hover:text-foreground transition-all',
                selectedTool &&
                  'text-blue-500 hover:text-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
              )}
            >
              <Wrench className="w-4 h-4" />
              {selectedTool && (
                <span className="ml-1 text-xs font-medium hidden sm:inline">
                  {selectedToolData?.name || 'Tool'}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {selectedTool ? `using: ${selectedToolData?.name}` : 'available tools'}
          </TooltipContent>{' '}
        </Tooltip>
      </TooltipProvider>{' '}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 min-w-[240px] bg-background/80 backdrop-blur-md border border-border/50 rounded-lg shadow-lg overflow-hidden"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
            <div className="">
              <button
                onClick={() => handleToolSelect('')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  'hover:bg-muted/50',
                  !selectedTool && 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                )}
              >
                <div className="flex-shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">general</div>
                </div>
              </button>

              {availableTools.map((tool, index) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolSelect(tool.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    'hover:bg-muted/50',
                    selectedTool === tool.id &&
                      'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                  )}
                >
                  <div className="flex-shrink-0">{tool.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{tool.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
