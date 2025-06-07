import { ChatInterface } from "@/components/chat-interface"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <ChatInterface />
      </div>
    </main>
  )
}
