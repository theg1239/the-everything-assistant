import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ChatInterface } from '@/components/chat-interface'
import { generateUUID } from '@/lib/utils'

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

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }

  const latestBroadcast = await getLatestBroadcast()

  // Pre-seed a stable client chat id for the session's first message.
  // We do NOT navigate to /chat/id until the user sends the first message.
  const seededId = generateUUID()

  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface chatId={seededId} autoResume={false} />
        </div>
      </div>
    </main>
  )
}
