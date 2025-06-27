'use client'

import { motion } from 'framer-motion'
import type { Message } from 'ai'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MessageActions } from './message-actions'
import { memo } from 'react'
import { useVTOP } from '../contexts/vtop-context'
import rehypeRaw from 'rehype-raw'

interface MessageBubbleProps {
  message: Message
  chatId?: string
  onCreateCanvas?: (content: string) => void
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}

const PureMessageBubble = ({
  message,
  chatId,
  onCreateCanvas,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: MessageBubbleProps) => {
  const { version } = useVTOP()
  const isUser = message.role === 'user'

  if (!isUser && (!message.content || (message.content as string).trim() === '') && message.toolInvocations?.some((t: any)=> t.toolName === 'knowledgeBase' && t.state !== 'result')) {
    return null
  }

  const hasVTOPCalls = message.toolInvocations?.some((tool: any) => tool.toolName === 'queryVTOP')

  return (
    <motion.div
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full mx-auto max-w-3xl px-4 group/message"
      data-role={message.role}
    >
      <div
        className={cn(
          'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:w-fit'
        )}
      >
        {/* {message.role === 'assistant' && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
            <div className="translate-y-px">
              <SparklesIcon size={14} />
            </div>
          </div>
        )} */}

        <div className="flex flex-col gap-4 w-full">
          {(() => {
            const visibleToolCalls = message.toolInvocations?.filter(
              (t: any) => t.toolName !== 'knowledgeBase'
            )
            return visibleToolCalls && visibleToolCalls.length > 0 ? (
              <ToolCallDisplay
              key={
                hasVTOPCalls ? `tool-calls-${message.id}-${version}` : `tool-calls-${message.id}`
              }
              toolCalls={visibleToolCalls}
              onLoginClick={onLoginClick}
              onPlacementSearch={onPlacementSearch}
              maximizedItem={maximizedItem}
              setMaximizedItem={setMaximizedItem}
            />
            ) : null
          })()}

          <div
            className={cn('flex flex-col gap-4', {
              'bg-primary text-primary-foreground px-3 py-2 rounded-xl': message.role === 'user',
            })}
          >
            {isUser ? (
              <p className="text-base leading-relaxed">{message.content}</p>
            ) : (
              (() => {
                const hasSuccessfulVTOPWithContent = message.toolInvocations?.some(
                  (tool: any) =>
                    tool.toolName === 'queryVTOP' &&
                    tool.result &&
                    tool.result.success !== false &&
                    (tool.result.formatted_content || tool.result.parsedData?.formatted_content)
                )

                if (hasSuccessfulVTOPWithContent) {
                  return null
                }

                const kbResult = message.toolInvocations?.find(
                  (t: any) => t.toolName === 'knowledgeBase' && t.state === 'result' && t.result?.answer
                )
                if ((!message.content || (message.content as string).trim()==='') && kbResult) {
                  return (
                    <div className="prose prose-invert prose-base max-w-none">
                      <ReactMarkdown
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-3 last:mb-0 leading-relaxed text-foreground">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
                          ),
                          li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
                          strong: ({ children }) => (
                            <strong className="font-semibold text-foreground">{children}</strong>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-xl font-semibold text-foreground mb-3">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-lg font-semibold text-foreground mb-2">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-base font-semibold text-foreground mb-2">
                              {children}
                            </h3>
                          ),
                          code: ({ children }) => (
                            <code className="bg-muted px-2 py-1 rounded text-sm font-mono break-all">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="bg-muted p-4 rounded-lg overflow-x-auto border mb-3 max-w-full">
                              {children}
                            </pre>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto mb-3">
                              <table className="min-w-full border border-border rounded-lg text-sm">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border border-border px-3 py-2 bg-muted text-foreground font-semibold text-sm">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-border px-3 py-2 text-muted-foreground text-sm">
                              {children}
                            </td>
                          ),
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 underline"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {(kbResult as any).result.answer}
                      </ReactMarkdown>
                    </div>
                  )
                }

                // // if no content yet (e.g., waiting on knowledgeBase answer) show thinking indicator
                // if (!message.content || (message.content as string).trim() === '') {
                //   return (
                //     <p className="text-muted-foreground italic">Thinking…</p>
                //   )
                // }

                return (
                  <div className="prose prose-invert prose-base max-w-none">
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        p: ({ children }) => (
                          <p className="mb-3 last:mb-0 leading-relaxed text-foreground">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground">{children}</strong>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-xl font-semibold text-foreground mb-3">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold text-foreground mb-2">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold text-foreground mb-2">
                            {children}
                          </h3>
                        ),
                        code: ({ children }) => (
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono break-all">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-muted p-4 rounded-lg overflow-x-auto border mb-3 max-w-full">
                            {children}
                          </pre>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-3">
                            <table className="min-w-full border border-border rounded-lg text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-border px-3 py-2 bg-muted text-foreground font-semibold text-sm">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-border px-3 py-2 text-muted-foreground text-sm">
                            {children}
                          </td>
                        ),
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 underline"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content as string}
                    </ReactMarkdown>
                  </div>
                )
              })()
            )}

            {/* Message actions */}
            {!isUser && chatId && (
              <MessageActions
                messageId={message.id}
                chatId={chatId}
                content={message.content}
                onCreateCanvas={onCreateCanvas}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export const MessageBubble = memo(PureMessageBubble)
