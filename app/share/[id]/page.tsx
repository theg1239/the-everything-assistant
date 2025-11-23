import { notFound } from 'next/navigation'
import { getChatShareWithMessages } from '@/lib/db'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { ChatInterface } from '@/components/chat-interface'

interface SharePageProps {
  params: Promise<{ id: string }>
}

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params
  const shared = await getChatShareWithMessages(id)

  if (!shared) {
    notFound()
  }

  const title = shared.share.title || shared.chat.title || 'Shared chat'
  const messages: LegacyMessage[] = shared.messages.map(msg => ({
    id: msg.id,
    role: msg.role as LegacyMessage['role'],
    content: msg.content,
    toolInvocations: (msg as any).toolInvocations,
    metadata: { sharedHistory: true, shareId: id, sourceChatId: shared.chat.id },
    createdAt: (msg as any).created_at || (msg as any).createdAt,
  }))

  return (
    <main className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface
            initialMessages={messages}
            chatId={`share-${id}`}
            autoResume={false}
            chatTitle={title}
          />
        </div>
      </div>
    </main>
  )
}
