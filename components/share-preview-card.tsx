import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { cn } from '@/lib/utils'
import { OptimizedMarkdown } from '@/components/optimized-markdown'

const ellipsize = (value: string | undefined, limit = 360) => {
  if (!value) return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed
}

export const deriveSharePreview = (messages: LegacyMessage[]) => {
  const firstUser = messages.find(msg => msg.role === 'user' && msg.content?.trim())
  const firstAssistant = messages.find(msg => msg.role === 'assistant' && msg.content?.trim())

  return {
    question: ellipsize(firstUser?.content, 320),
    answer: ellipsize(firstAssistant?.content, 520),
  }
}

interface SharePreviewCardProps {
  title: string
  messages: LegacyMessage[]
  className?: string
  hideTitle?: boolean
}

export function SharePreviewCard({ title, messages, className, hideTitle }: SharePreviewCardProps) {
  const { question, answer } = deriveSharePreview(messages)

  return (
    <div
      className={cn(
        'rounded-[18px] border border-white/10 bg-slate-950/70 shadow-[0_25px_60px_-30px_rgba(0,0,0,0.55)] backdrop-blur',
        className
      )}
    >
      {!hideTitle && (
        <div className="px-6 pt-6 pb-3 text-center">
          <p className="text-2xl font-semibold tracking-tight text-white">{title || 'Shared chat'}</p>
        </div>
      )}
      <div className="px-6 pb-6 space-y-3">
        <OptimizedMarkdown
          id={`${title}-preview-question`}
          content={question || 'No prompt yet—ask a question to kick things off.'}
        />
        <div className="h-px bg-white/10" />
        <OptimizedMarkdown
          id={`${title}-preview-answer`}
          content={answer || 'Once a response exists, it will appear here.'}
        />
      </div>
    </div>
  )
}
