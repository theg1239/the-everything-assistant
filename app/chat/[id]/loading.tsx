/**
 * Instant navigation/prefetch boundary for /chat/[id]: shown while the chat,
 * its messages and hub state load. Mirrors ChatInterface's message column
 * (max-w-3xl, alternating user/assistant bubbles) and bottom composer.
 */
export default function ChatLoading() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col bg-transparent"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="h-14 shrink-0" />
        <div className="flex-1 overflow-hidden">
          <div className="mx-auto max-w-3xl space-y-6 px-4 pt-5 motion-safe:animate-pulse">
            <div className="flex justify-end">
              <div className="h-10 w-2/5 rounded-2xl bg-muted/60" />
            </div>
            <div className="space-y-2.5">
              <div className="h-4 w-11/12 rounded bg-muted/50" />
              <div className="h-4 w-4/5 rounded bg-muted/50" />
              <div className="h-4 w-3/5 rounded bg-muted/50" />
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-1/3 rounded-2xl bg-muted/60" />
            </div>
            <div className="space-y-2.5">
              <div className="h-4 w-10/12 rounded bg-muted/50" />
              <div className="h-4 w-2/3 rounded bg-muted/50" />
            </div>
          </div>
        </div>
        <div className="shrink-0 px-4 pb-6">
          <div className="mx-auto h-[6.5rem] max-w-3xl rounded-3xl border border-border/60 bg-muted/30" />
        </div>
      </div>
    </main>
  )
}
