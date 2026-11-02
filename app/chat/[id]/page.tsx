import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getChat, getMessages } from '@/lib/db'
import { ChatInterface } from '@/components/chat-interface'
import {
  loadPersonalHubState,
  syncCoreHubSnapshots,
  refreshVTOPSnapshotAction,
  runHubToolAction,
} from '@/app/actions/hub'
import type { PersonalHubState } from '@/types/hub'

interface ChatPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  const [session, { id }] = await Promise.all([auth(), params])

  if (!session?.user) {
    redirect('/login')
  }

  const fallbackHubState: PersonalHubState = { isLinked: false, snapshots: [], lastSyncedAt: null }
  // Ownership check, messages and hub state are independent reads: run them together.
  // Messages are only rendered once `getChat` has confirmed the chat belongs to the user.
  const [chat, messages, initialHubState] = await Promise.all([
    getChat(id, session.user.id),
    getMessages(id),
    loadPersonalHubState().catch(() => fallbackHubState),
  ])

  if (!chat) {
    redirect('/')
  }
  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface
            initialMessages={messages.map(msg => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              toolInvocations: msg.toolInvocations,
              attachments: msg.attachments,
              createdAt: msg.created_at,
            }))}
            chatId={id}
            key={id}
            autoResume={false}
            chatTitle={chat.title}
            initialHubState={initialHubState}
            hubActions={{
              refreshState: loadPersonalHubState,
              syncCore: syncCoreHubSnapshots,
              refreshVTOP: refreshVTOPSnapshotAction,
              runTool: runHubToolAction,
            }}
          />
        </div>
      </div>
    </main>
  )
}
