import { revalidateTag, unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { broadcastSlidesSchema, type LatestBroadcastResponse } from '@/types/api/broadcast'

/** Cache tag for broadcast reads; invalidate after any broadcast create/update/delete. */
export const BROADCAST_CACHE_TAG = 'broadcast'

/**
 * Newest broadcast (or `null`), shaped for `GlobalBroadcastDialog`. Cached across
 * requests and invalidated via {@link revalidateBroadcasts}; the time-based
 * revalidate is only a safety net for deployments without a shared tag cache.
 */
export const getLatestBroadcast = unstable_cache(
  async (): Promise<LatestBroadcastResponse | null> => {
    const latest = await prisma.broadcast.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, slides: true, createdAt: true },
    })
    if (!latest) return null
    const slides = broadcastSlidesSchema.safeParse(latest.slides)
    if (!slides.success) return null
    return { id: latest.id, slides: slides.data, createdAt: latest.createdAt.toISOString() }
  },
  ['latest-broadcast'],
  { tags: [BROADCAST_CACHE_TAG], revalidate: 300 }
)

/** Expire cached broadcast reads immediately (call from mutation handlers). */
export function revalidateBroadcasts() {
  revalidateTag(BROADCAST_CACHE_TAG, { expire: 0 })
}
