import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getChat, getMessagesPage } from '@/lib/db'
import { CHAT_HISTORY_PAGE_SIZE, toClientMessage } from '@/lib/chat-history'
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
  // Streamed, not awaited: the hub drawer is closed by default and waits for this itself.
  const hubState = loadPersonalHubState().catch(() => fallbackHubState)
  // Ownership check and the newest page of messages are independent reads: run them together.
  // Messages are only rendered once `getChat` has confirmed the chat belongs to the user. Older
  // history is fetched on demand ("show earlier messages").
  const [chat, history] = await Promise.all([
    getChat(id, session.user.id),
    getMessagesPage(id, { limit: CHAT_HISTORY_PAGE_SIZE }),
  ])

  if (!chat) {
    redirect('/')
  }
  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface
            initialMessages={history.messages.map(toClientMessage)}
            hasEarlierMessages={history.hasMore}
            chatId={id}
            key={id}
            autoResume={false}
            chatTitle={chat.title}
            hubState={hubState}
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
