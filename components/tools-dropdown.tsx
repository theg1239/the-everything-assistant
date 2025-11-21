'use client'

import * as React from 'react'
import { Wrench, Search, FileText, GraduationCap, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Tool {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

const availableTools: Tool[] = [
  {
    id: 'web-search',
    name: 'web search',
    description: 'Search the live web for up-to-date answers',
    icon: <Search className="w-4 h-4" />,
  },
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
    icon: <FileText className="w-4 h-4" />,
  },
]

interface ToolsDropdownProps {
  onToolSelect?: (toolId: string) => void
  selectedTool?: string
}

export function ToolsDropdown({ onToolSelect, selectedTool }: ToolsDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleToolSelect = (toolId: string) => {
    onToolSelect?.(toolId)
    setIsOpen(false)
  }

  const selectedToolData = availableTools.find(tool => tool.id === selectedTool)
  const selectedName = selectedToolData?.name || selectedTool || 'general'

  const toolEntries: Tool[] = React.useMemo(
    () => [
      {
        id: '',
        name: 'general',
        description: 'Default assistant behavior',
        icon: <MessageSquare className="w-4 h-4" />,
      },
      ...availableTools,
    ],
    []
  )

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 px-2 text-muted-foreground hover:text-foreground transition-all',
                  selectedTool &&
                    'text-blue-500 hover:text-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
                )}
              >
                {selectedTool ? (
                  <>
                    <Wrench className="w-4 h-4" />
                    <span className="ml-1 text-xs font-medium hidden sm:inline">{selectedName}</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium hidden sm:inline mr-1">Tools</span>
                    <Wrench className="w-4 h-4" />
                  </>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{selectedTool ? `using: ${selectedName}` : 'available tools'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-56 p-1 border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur"
      >
        <div className="flex flex-col py-1" role="menu">
          {toolEntries.map(entry => {
            const isActive = (selectedTool || '') === entry.id
            return (
              <button
                key={entry.id || 'general'}
                onClick={() => handleToolSelect(entry.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm capitalize transition-colors text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  isActive
                    ? 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200'
                    : 'hover:bg-muted/60 text-foreground/90'
                )}
                role="menuitemradio"
                aria-checked={isActive}
              >
                <span className="text-muted-foreground">
                  {React.isValidElement(entry.icon)
                    ? React.cloneElement(entry.icon as React.ReactElement, { className: 'w-4 h-4' })
                    : entry.icon}
                </span>
                <span className="flex-1 truncate">{entry.name}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
