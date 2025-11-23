'use client'

import { useRef } from 'react'
import UploadForm from '@/components/upload-form'
import PapersList, { type PapersListRef } from '@/components/papers-list'
import { PapersHeader } from '@/components/papers-header'

export default function Home() {
  const papersListRef = useRef<PapersListRef | null>(null)

  const handleUploadSuccess = () => {
    papersListRef.current?.refreshPapers()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PapersHeader />

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        <section className="modern-card p-6">
          <div className="flex flex-col gap-2">
            <p className="pill w-fit">Upload & Search</p>
            <h2 className="text-xl font-semibold">Drop a paper and keep working.</h2>
            <p className="text-sm text-muted-foreground">
              Mirrors the chat UI: simple borders, neutral background, minimal chrome.
            </p>
          </div>
          <div className="mt-6">
            <UploadForm onUploadSuccess={handleUploadSuccess} />
          </div>
        </section>

        <section className="modern-card p-6">
          <PapersList ref={papersListRef} />
        </section>
      </main>
    </div>
  )
}
