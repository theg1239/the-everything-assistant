import { useCallback, useEffect, useMemo, useState } from 'react'
import { Track } from '@/lib/stores/useMiniPlayerStore'
import { isRecord } from '@/lib/json'
import { errorMessage } from '@/components/narrow'

export interface MiniLyricLine {
  startTimeMs: number
  words: string
}

const parseLrc = (lrcText: string): MiniLyricLine[] => {
  if (!lrcText) return []
  return lrcText
    .split('\n')
    .map((line) => {
      const match = line.match(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.+)/)
      if (!match) return null
      const [, min, sec, frac = '0', text = ''] = match
      const ms = Number(min) * 60 * 1000 + Number(sec) * 1000 + Number(frac.padEnd(3, '0'))
      return { startTimeMs: ms, words: text.trim() }
    })
    .filter((v): v is MiniLyricLine => Boolean(v && v.words))
}

/** Index of the lyric line active at `timeMs` (lines are sorted by start time), or -1. */
export function getCurrentLyricLineIndex(lines: MiniLyricLine[], timeMs: number): number {
  let idx = -1
  for (const [i, line] of lines.entries()) {
    if (timeMs >= line.startTimeMs) {
      idx = i
    } else {
      break
    }
  }
  return idx
}

interface LyricsFetchResult {
  lines: MiniLyricLine[]
  error: string | null
}

async function fetchLyricLines(track: Track): Promise<LyricsFetchResult> {
  try {
    const res = await fetch('/api/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: track.title,
        artist: track.artist ?? '',
        album: track.album ?? '',
      }),
    })
    if (!res.ok) {
      throw new Error('Lyrics unavailable')
    }
    const json: unknown = await res.json().catch(() => null)
    const lyricsText = isRecord(json) && typeof json.lyrics === 'string' ? json.lyrics : ''
    return { lines: parseLrc(lyricsText), error: null }
  } catch (err) {
    return { lines: [], error: errorMessage(err) || 'Lyrics unavailable' }
  }
}

/** Fetches and parses the lyrics for `track` (time-independent part of {@link useMiniLyrics}). */
export function useMiniLyricLines(track: Track | null) {
  const [lines, setLines] = useState<MiniLyricLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const fetchLyrics = useCallback(async () => {
    if (!track) {
      setLines([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const result = await fetchLyricLines(track)
    setLines(result.lines)
    if (result.error) setError(result.error)
    setLoading(false)
  }, [track])

  useEffect(() => {
    fetchLyrics()
  }, [fetchLyrics, refreshNonce])

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), [])

  return useMemo(
    () => ({
      lines,
      loading,
      error,
      refresh,
    }),
    [lines, loading, error, refresh]
  )
}

export function useMiniLyrics(track: Track | null, currentTimeMs: number) {
  const { lines, loading, error, refresh } = useMiniLyricLines(track)
  const lyricOffset = track?.lyricOffset ?? 0
  const currentLine = lines.length ? getCurrentLyricLineIndex(lines, currentTimeMs + lyricOffset) : -1

  return useMemo(
    () => ({
      lines,
      currentLine,
      loading,
      error,
      refresh,
    }),
    [lines, currentLine, loading, error, refresh]
  )
}
