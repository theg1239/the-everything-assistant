'use client'

import { useEffect, useRef } from 'react'
import { useMiniPlayerStore } from '@/lib/stores/useMiniPlayerStore'
import { toast } from 'sonner'
import { asRecord, readString } from '@/components/narrow'

/** Minimal shape of a tool invocation this handler inspects. `result` is unvalidated. */
type MusicToolInvocation = {
  toolName?: string
  toolCallId?: string
  id?: string
  state?: string
  result?: unknown
}

interface MusicPlayerToolHandlerProps {
  toolInvocations?: MusicToolInvocation[]
}

const PROCESSED_TOOL_IDS_KEY = 'ea.musicPlayer.processedToolIds'
const MAX_STORED_IDS = 100

function getPersistedProcessedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = sessionStorage.getItem(PROCESSED_TOOL_IDS_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((id): id is string => typeof id === 'string'))
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

/**
 * Applies `musicPlayer` tool results to the mini player store. Mounted once per message, so it
 * deliberately does not subscribe to the store: player state is read when a tool result is applied.
 */
export function MusicPlayerToolHandler({ toolInvocations }: MusicPlayerToolHandlerProps) {
  const processedToolIds = useRef<Set<string>>(getPersistedProcessedIds())

  useEffect(() => {
    if (!toolInvocations) return

    for (const tool of toolInvocations) {
      if (tool.toolName !== 'musicPlayer') continue
      if (!tool.result) continue
      if (tool.state !== 'result') continue
      
      const toolId = tool.toolCallId || tool.id
      if (!toolId) continue
      
      if (processedToolIds.current.has(toolId)) continue
      
      const result = asRecord(tool.result)
      const clientAction = readString(result?.clientAction)
      const trackId = readString(result?.trackId)
      const loopMode = result?.loopMode
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
      } = useMiniPlayerStore.getState()
      
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
            if (track) {
              playTrack(trackId)
              toast.success(`Now playing: ${track.title}`)
            } else {
              toast.error('That track is not in the player queue')
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
          break
      }
    }
  }, [toolInvocations])

  return null
}
