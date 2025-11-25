'use server'

import { prisma } from '@/lib/prisma'
import { broadcastSlidesSchema, type BroadcastSlide } from '@/types/api/broadcast'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface BroadcastWithMeta {
  id: string
  slides: BroadcastSlide[]
  createdAt: Date
}

async function getAllBroadcasts(): Promise<BroadcastWithMeta[]> {
  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return broadcasts.map(b => ({
      id: b.id,
      slides: broadcastSlidesSchema.parse(b.slides),
      createdAt: b.createdAt,
    }))
  } catch (error) {
    console.error('failed to fetch broadcasts', error)
    return []
  }
}

export default async function UpdatesPage() {
  const broadcasts = await getAllBroadcasts()

  return (
    <main className="min-h-screen bg-background overflow-y-auto" data-allow-touch-scroll>
      <div className="max-w-3xl mx-auto px-6 py-16 sm:py-24 pb-32">
        <header className="mb-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            back
          </Link>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">updates</h1>
          <p className="text-muted-foreground mt-2 text-lg">what&apos;s new and noteworthy</p>
        </header>

        {broadcasts.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">no updates yet</p>
        ) : (
          <div className="space-y-20">
            {broadcasts.map(broadcast => {
              const firstSlide = broadcast.slides[0]
              if (!firstSlide) return null

              return (
                <article key={broadcast.id} className="group">
                  <time className="text-xs text-muted-foreground/70 uppercase tracking-widest font-medium">
                    {formatDistanceToNow(broadcast.createdAt, { addSuffix: true })} · {format(broadcast.createdAt, 'EEEE, MMM d')}
                  </time>

                  <div className="mt-5 space-y-5">
                    <div className="relative aspect-[2.5/1] w-full overflow-hidden rounded-2xl bg-muted shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={firstSlide.image}
                        alt={firstSlide.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 flex items-center justify-center px-6">
                        <h2 className="text-xl sm:text-2xl font-semibold text-white text-center drop-shadow-lg max-w-lg">
                          {firstSlide.title}
                        </h2>
                      </div>
                    </div>

                    <div className="space-y-3 pl-1">
                      {broadcast.slides.map((slide, idx) => (
                        <p key={idx} className="text-muted-foreground leading-relaxed text-[15px]">
                          {slide.text}
                        </p>
                      ))}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
