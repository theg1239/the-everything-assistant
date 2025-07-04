"use client"

import { useRef } from "react"
import UploadForm from "@/components/upload-form"
import PapersList, { type PapersListRef } from "@/components/papers-list"
import { PapersHeader } from "@/components/papers-header"

export default function Home() {
  const papersListRef = useRef<PapersListRef | null>(null)

  const handleUploadSuccess = () => {
    papersListRef.current?.refreshPapers()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/30">
      <PapersHeader />

      <div className="relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute left-1/4 top-20 h-96 w-96 rounded-full bg-gradient-to-br from-blue-100/20 to-purple-100/20 blur-3xl animate-float dark:from-blue-900/10 dark:to-purple-900/10" />
          <div
            className="absolute right-1/4 bottom-20 h-96 w-96 rounded-full bg-gradient-to-br from-green-100/20 to-blue-100/20 blur-3xl animate-float dark:from-green-900/10 dark:to-blue-900/10"
            style={{ animationDelay: "3s" }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="space-y-20">
            <UploadForm onUploadSuccess={handleUploadSuccess} />
            <PapersList ref={papersListRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
