import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ChatInterface } from '@/components/chat-interface'
import { generateUUID } from '@/lib/utils'
import {
  loadPersonalHubState,
  syncCoreHubSnapshots,
  refreshVTOPSnapshotAction,
  runHubToolAction,
} from '@/app/actions/hub'
import type { PersonalHubState } from '@/types/hub'

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomeProps) {
  const [resolvedSearchParams, session] = await Promise.all([
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
    auth(),
  ])
  const guestMode = resolvedSearchParams?.guest === '1'
  if (!session?.user && !guestMode) {
    redirect('/login')
  }

  const initialChatId = generateUUID()
  const fallbackHubState: PersonalHubState = { isLinked: false, snapshots: [], lastSyncedAt: null }
  const isAuthenticated = Boolean(session?.user)
  // The latest broadcast is rendered by the root layout; only hub state is needed here. It is
  // streamed, not awaited: the hub drawer is closed by default and waits for it itself.
  const hubState = isAuthenticated
    ? loadPersonalHubState().catch(() => fallbackHubState)
    : undefined

  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface
            chatId={initialChatId}
            key={initialChatId}
            autoResume={false}
            hubState={hubState}
            hubActions={
              isAuthenticated
                ? {
                    refreshState: loadPersonalHubState,
                    syncCore: syncCoreHubSnapshots,
                    refreshVTOP: refreshVTOPSnapshotAction,
                    runTool: runHubToolAction,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </main>
  )
}
