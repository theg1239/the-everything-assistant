import { NextRequest, NextResponse } from 'next/server'
import * as z from 'zod'

const optionalString = z.string().optional().catch(undefined)

const lrclibResultSchema = z.object({
  trackName: z.string().nullish().catch(undefined),
  artistName: z.string().nullish().catch(undefined),
  albumName: z.string().nullish().catch(undefined),
  syncedLyrics: z.string().nullish().catch(undefined),
  plainLyrics: z.string().nullish().catch(undefined),
})

const lrclibResponseSchema = z.array(lrclibResultSchema).catch([])

const lyricsRequestSchema = z
  .object({ title: optionalString, artist: optionalString, album: optionalString })
  .catch({})

export async function POST(req: NextRequest) {
  const {
    title = '',
    artist = '',
    album = '',
  } = lyricsRequestSchema.parse(await req.json().catch(() => ({})))

  if (!title && !artist) {
    return NextResponse.json({ error: 'Missing title or artist' }, { status: 400 })
  }

  const url = new URL('https://lrclib.net/api/search')
  if (title) url.searchParams.set('track_name', title)
  if (artist) url.searchParams.set('artist_name', artist)
  if (album) url.searchParams.set('album_name', album)
  url.searchParams.set('limit', '1')

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
      return NextResponse.json({ error: 'Lyrics not found' }, { status: 404 })
    }
    const [first] = lrclibResponseSchema.parse(await res.json())
    const lyrics = first?.syncedLyrics || first?.plainLyrics
    if (!lyrics) {
      return NextResponse.json({ error: 'Lyrics not found' }, { status: 404 })
    }
    return NextResponse.json({
      lyrics,
      title: first?.trackName ?? title,
      artist: first?.artistName ?? artist,
      album: first?.albumName ?? album,
    })
  } catch (err) {
    console.error('Lyrics fetch failed', err)
    return NextResponse.json({ error: 'Lyrics service unavailable' }, { status: 500 })
  }
}
