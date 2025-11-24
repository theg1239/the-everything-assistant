import { useCallback, useEffect, useMemo, useState } from 'react'
import { Track } from '@/lib/stores/useMiniPlayerStore'

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
      const [, min, sec, frac = '0', text] = match
      const ms = Number(min) * 60 * 1000 + Number(sec) * 1000 + Number(frac.padEnd(3, '0'))
      return { startTimeMs: ms, words: text.trim() }
    })
    .filter((v): v is MiniLyricLine => Boolean(v && v.words))
}

export function useMiniLyrics(track: Track | null, currentTimeMs: number) {
  const [lines, setLines] = useState<MiniLyricLine[]>([])
  const [currentLine, setCurrentLine] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const lyricOffset = track?.lyricOffset ?? 0

  const fetchLyrics = useCallback(async () => {
    if (!track) {
      setLines([])
      setCurrentLine(-1)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
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
      const json = (await res.json().catch(() => null)) as
        | { lyrics?: string; title?: string; artist?: string; album?: string }
        | null
      const lyricsText = typeof json?.lyrics === 'string' ? json.lyrics : ''
      const parsed = parseLrc(lyricsText)
      setLines(parsed)
    } catch (err: any) {
      setLines([])
      setError(err?.message || 'Lyrics unavailable')
    } finally {
      setLoading(false)
    }
  }, [track])

  useEffect(() => {
    fetchLyrics()
  }, [fetchLyrics, refreshNonce])

  useEffect(() => {
    if (!lines.length) {
      setCurrentLine(-1)
      return
    }
    const t = currentTimeMs + lyricOffset
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (t >= lines[i].startTimeMs) {
        idx = i
      } else {
        break
      }
    }
    setCurrentLine(idx)
  }, [currentTimeMs, lines, lyricOffset])

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), [])

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
