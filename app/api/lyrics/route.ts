import { NextRequest, NextResponse } from 'next/server'

type LrclibResult = {
  trackName?: string
  artistName?: string
  albumName?: string
  syncedLyrics?: string
  plainLyrics?: string
}

export async function POST(req: NextRequest) {
  const { title = '', artist = '', album = '' } = (await req.json().catch(() => ({}))) as {
    title?: string
    artist?: string
    album?: string
  }

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
    const json = (await res.json()) as LrclibResult[] | undefined
    const first = Array.isArray(json) ? json[0] : null
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
  } catch (err: any) {
    console.error('Lyrics fetch failed', err)
    return NextResponse.json({ error: 'Lyrics service unavailable' }, { status: 500 })
  }
}
