import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { ChatInterface } from "@/components/chat-interface"

export default async function Home() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <ChatInterface />
    </main>
  )
}
