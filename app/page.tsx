import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ChatInterface } from '@/components/chat-interface'

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }
  return (
    <main className="flex min-h-screen flex-col bg-transparent">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ChatInterface autoResume={false} />
        </div>
      </div>
    </main>
  )
}
