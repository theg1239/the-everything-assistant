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

  const messages = await getMessages(id)
  return (
    <ChatInterface
      initialMessages={messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
        createdAt: msg.created_at,
      }))}
      chatId={id}
      autoResume={true}
    />
  )
}
