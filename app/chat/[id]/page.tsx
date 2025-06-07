import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getChat, getMessages } from "@/lib/db"
import { ChatInterface } from "@/components/chat-interface"

interface ChatPageProps {
  params: {
    id: string
  }
}

export default async function ChatPage({ params }: ChatPageProps) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/login")
  }

  const chat = await getChat(params.id, session.user.id)

  if (!chat) {
    redirect("/")
  }

  const messages = await getMessages(params.id)

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <ChatInterface
        initialMessages={messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          toolInvocations: msg.toolInvocations,
          createdAt: msg.created_at,
        }))}
        chatId={params.id}
      />
    </div>
  )
}
