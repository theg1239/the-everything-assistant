import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const chat = await getChat(id, session.user.id)

  if (!chat) {
    redirect('/')
  }

  const fallbackHubState: PersonalHubState = { isLinked: false, snapshots: [], lastSyncedAt: null }
  const [messages, initialHubState] = await Promise.all([
    getMessages(id),
    loadPersonalHubState().catch(() => fallbackHubState),
  ])
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
              createdAt: msg.created_at,
            }))}
            chatId={id}
            key={id}
            autoResume={false}
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
