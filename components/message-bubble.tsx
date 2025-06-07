"use client"

import { motion } from "framer-motion"
import type { Message } from "ai"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import { ToolCallDisplay } from "./tool-call-display"
import { MessageActions } from "./message-actions"

interface MessageBubbleProps {
  message: Message
  chatId?: string
}

export function MessageBubble({ message, chatId }: MessageBubbleProps) {
  const isUser = message.role === "user"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("flex items-start gap-6 w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "rounded-3xl px-8 py-6 max-w-[85%] shadow-xl",
          isUser
            ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white"
            : "bg-slate-800/40 backdrop-blur-xl border border-slate-700/30 text-slate-100",
        )}
      >
        {isUser ? (
          <p className="text-base leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-4">
            {/* Tool calls display */}
            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <ToolCallDisplay toolCalls={message.toolInvocations} />
            )}

            {/* Message content */}
            <div className="prose prose-invert prose-base max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-slate-100">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-2">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-100">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                  h1: ({ children }) => <h1 className="text-xl font-semibold text-white mb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold text-white mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold text-white mb-2">{children}</h3>,
                  code: ({ children }) => (
                    <code className="bg-slate-700/50 px-2 py-1 rounded text-blue-300 text-sm">{children}</code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-slate-900/50 p-4 rounded-xl overflow-x-auto border border-slate-700/30 mb-3">
                      {children}
                    </pre>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-3">
                      <table className="min-w-full border border-slate-700/30 rounded-lg">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-slate-700/30 px-3 py-2 bg-slate-700/30 text-white font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-slate-700/30 px-3 py-2 text-slate-100">{children}</td>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content as string}
              </ReactMarkdown>
            </div>

            {/* Message actions */}
            {chatId && <MessageActions messageId={message.id} chatId={chatId} content={message.content} />}
          </div>
        )}
      </div>
    </motion.div>
  )
}
