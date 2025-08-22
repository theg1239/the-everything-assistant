import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, getMessages } from '@/lib/db'
import { ChatInterface } from '@/components/chat-interface'

interface ChatPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const chat = await getChat(id, session.user.id)

  if (!chat) {
    redirect('/')
  }
  const dbMessages = await getMessages(id)
  const initialMessages = dbMessages.map(m => ({
    id: m.id,
    role: m.role as any,
    parts: typeof m.content === 'string' && m.content.trim() ? [{ type: 'text', text: m.content }] : [],
    toolInvocations: Array.isArray((m as any).toolInvocations) ? (m as any).toolInvocations : undefined,
  }))
  
  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface chatId={id} autoResume={true} initialMessages={initialMessages as any} />
        </div>
      </div>
    </main>
  )
}
