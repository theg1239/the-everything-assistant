'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ThumbsUp, ThumbsDown, Copy, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageActionsProps {
  messageId: string
  chatId: string
  content: string
  onCreateCanvas?: (content: string) => void
}

export function MessageActions({
  messageId,
  chatId,
  content,
  onCreateCanvas,
}: MessageActionsProps) {
  const [vote, setVote] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  const handleVote = async (isUpvoted: boolean) => {
    try {
      await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          messageId,
          isUpvoted,
        }),
      })
      setVote(isUpvoted)
    } catch (error) {
      console.error('Error voting:', error)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Error copying:', error)
    }
  }

  const createCanvasDocument = () => {
    if (onCreateCanvas) {
      onCreateCanvas(content)
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-slate-700/30">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVote(true)}
              className={cn(
                'h-8 w-8 p-0 text-slate-400 hover:text-green-400',
                vote === true && 'text-green-400'
              )}
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">upvote</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVote(false)}
              className={cn(
                'h-8 w-8 p-0 text-slate-400 hover:text-red-400',
                vote === false && 'text-red-400'
              )}
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">downvote</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">copy text</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={createCanvasDocument}
              className="h-8 w-8 p-0 text-slate-400 hover:text-purple-400"
            >
              <GraduationCap className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">open the hub</TooltipContent>
        </Tooltip>

        {copied && <span className="text-xs text-green-400">copied!</span>}
      </div>
    </TooltipProvider>
  )
}
