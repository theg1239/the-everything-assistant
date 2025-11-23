import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ChatInterface } from '@/components/chat-interface'
import { generateUUID } from '@/lib/utils'
import {
  loadPersonalHubState,
  syncCoreHubSnapshots,
  refreshVTOPSnapshotAction,
  runHubToolAction,
} from '@/app/actions/hub'
import type { PersonalHubState } from '@/types/hub'

async function getLatestBroadcast() {
  try {
    const res = await fetch(
      process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/broadcast/latest`
        : 'http://localhost:3000/api/broadcast/latest',
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const session = await getServerSession(authOptions)
  const guestMode = resolvedSearchParams?.guest === '1'
  if (!session?.user && !guestMode) {
    redirect('/login')
  }

  const initialChatId = generateUUID()
  const fallbackHubState: PersonalHubState = { isLinked: false, snapshots: [], lastSyncedAt: null }
  const isAuthenticated = Boolean(session?.user)
  const [latestBroadcast, initialHubState] = await Promise.all([
    isAuthenticated ? getLatestBroadcast() : Promise.resolve(null),
    isAuthenticated ? loadPersonalHubState().catch(() => fallbackHubState) : Promise.resolve(fallbackHubState),
  ])

  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface
            chatId={initialChatId}
            key={initialChatId}
            autoResume={false}
            initialHubState={initialHubState}
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
