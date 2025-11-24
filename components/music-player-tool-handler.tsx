'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useMiniPlayerStore, Track } from '@/lib/stores/useMiniPlayerStore'
import { toast } from 'sonner'

interface MusicPlayerToolHandlerProps {
  toolInvocations?: any[]
}

const PROCESSED_TOOL_IDS_KEY = 'ea.musicPlayer.processedToolIds'
const MAX_STORED_IDS = 100

function getPersistedProcessedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = sessionStorage.getItem(PROCESSED_TOOL_IDS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return new Set(parsed)
      }
    }
  } catch (e) {
  }
  return new Set()
}

function persistProcessedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(ids).slice(-MAX_STORED_IDS)
    sessionStorage.setItem(PROCESSED_TOOL_IDS_KEY, JSON.stringify(arr))
  } catch (e) {
  }
}

export function MusicPlayerToolHandler({ toolInvocations }: MusicPlayerToolHandlerProps) {
  const processedToolIds = useRef<Set<string>>(getPersistedProcessedIds())
  
  const {
    tracks,
    isPlaying,
    loopAll,
    loopCurrent,
    isShuffled,
    togglePlay,
    nextTrack,
    previousTrack,
    playTrack,
    setIsPlaying,
    toggleShuffle,
    toggleLoopAll,
    toggleLoopCurrent,
  } = useMiniPlayerStore()

  const findBestMatch = useCallback((query: string): Track | null => {
    const q = query.toLowerCase()
    
    const exactTitle = tracks.find(t => t.title.toLowerCase() === q)
    if (exactTitle) return exactTitle
    
    const startsWithTitle = tracks.find(t => t.title.toLowerCase().startsWith(q))
    if (startsWithTitle) return startsWithTitle
    
    const containsTitle = tracks.find(t => t.title.toLowerCase().includes(q))
    if (containsTitle) return containsTitle
    
    const artistMatch = tracks.find(t => 
      t.artist && t.artist.toLowerCase().includes(q)
    )
    if (artistMatch) return artistMatch
    
    const words = q.split(/\s+/).filter(w => w.length > 2)
    if (words.length > 0) {
      const wordMatch = tracks.find(t => {
        const titleLower = t.title.toLowerCase()
        const artistLower = (t.artist || '').toLowerCase()
        return words.some(word => titleLower.includes(word) || artistLower.includes(word))
      })
      if (wordMatch) return wordMatch
    }
    
    return null
  }, [tracks])

  useEffect(() => {
    if (!toolInvocations) return

    for (const tool of toolInvocations) {
      if (tool.toolName !== 'musicPlayer') continue
      if (!tool.result) continue
      if (tool.state !== 'result') continue
      
      const toolId = tool.toolCallId || tool.id
      if (!toolId) continue
      
      if (processedToolIds.current.has(toolId)) continue
      
      const { clientAction, query, trackId, loopMode } = tool.result
      if (!clientAction) continue
      
      processedToolIds.current.add(toolId)
      persistProcessedIds(processedToolIds.current)
      
      const isStateChangingAction = ![
        'GET_STATUS',
        'SEARCH',
      ].includes(clientAction)
      
      const isLikelyFromHistory = toolInvocations.length > 1 && 
        toolInvocations.indexOf(tool) < toolInvocations.length - 1
      
      if (isStateChangingAction && isLikelyFromHistory) {
        continue
      }
      
      switch (clientAction) {
        case 'GET_STATUS':
          break
          
        case 'SEARCH':
          break
          
        case 'PLAY':
          if (!isPlaying) {
            setIsPlaying(true)
            toast.success('Playback resumed')
          }
          break
          
        case 'PAUSE':
          if (isPlaying) {
            setIsPlaying(false)
            toast.success('Playback paused')
          }
          break
          
        case 'TOGGLE_PLAY':
          togglePlay()
          toast.success(isPlaying ? 'Paused' : 'Playing')
          break
          
        case 'NEXT':
          nextTrack()
          toast.success('Skipped to next track')
          break
          
        case 'PREVIOUS':
          previousTrack()
          toast.success('Previous track')
          break
          
        case 'PLAY_TRACK':
          if (trackId) {
            const track = tracks.find(t => t.id === trackId)
            playTrack(trackId)
            if (track) {
              toast.success(`Now playing: ${track.title}`)
            }
          }
          break
          
        case 'SEARCH_AND_PLAY':
          if (query) {
            const match = findBestMatch(query)
            if (match) {
              playTrack(match.id)
              toast.success(`Now playing: ${match.title}`)
            } else {
              toast.error(`No track found matching "${query}"`)
            }
          }
          break
          
        case 'TOGGLE_SHUFFLE':
          toggleShuffle()
          toast.success(isShuffled ? 'Shuffle off' : 'Shuffle on')
          break
          
        case 'TOGGLE_LOOP': {
          if (!loopAll && !loopCurrent) {
            toggleLoopAll()
            toast.success('Loop all tracks')
          } else if (loopAll && !loopCurrent) {
            toggleLoopAll()
            toggleLoopCurrent()
            toast.success('Loop current track')
          } else {
            if (loopAll) toggleLoopAll()
            if (loopCurrent) toggleLoopCurrent()
            toast.success('Loop off')
          }
          break
        }
          
        case 'SET_LOOP_MODE':
          if (loopMode === 'none') {
            if (loopAll) toggleLoopAll()
            if (loopCurrent) toggleLoopCurrent()
            toast.success('Loop off')
          } else if (loopMode === 'all') {
            if (!loopAll) toggleLoopAll()
            if (loopCurrent) toggleLoopCurrent()
            toast.success('Loop all tracks')
          } else if (loopMode === 'current') {
            if (loopAll) toggleLoopAll()
            if (!loopCurrent) toggleLoopCurrent()
            toast.success('Loop current track')
          }
          break
          
        default:
          console.log('[MusicPlayerTool] Unknown clientAction:', clientAction)
      }
    }
  }, [
    toolInvocations,
    findBestMatch,
    isPlaying,
    isShuffled,
    tracks,
    togglePlay,
    nextTrack,
    previousTrack,
    playTrack,
    setIsPlaying,
    toggleShuffle,
    toggleLoopAll,
    toggleLoopCurrent,
    loopAll,
    loopCurrent,
  ])

  return null
}
