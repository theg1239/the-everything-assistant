import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolExecutor, isRecord } from '../app/api/chat/lib/tool-helpers'
import { createMusicPlayerTool, searchTracks, type MusicPlayerToolState } from '../lib/music-player-tool'

const tracks = [
  { id: 'a1', title: 'Blinding Lights', artist: 'The Weeknd' },
  { id: 'b2', title: 'Lights Up', artist: 'Harry Styles' },
  { id: 'c3', title: 'Levitating', artist: 'Dua Lipa' },
]

const state: MusicPlayerToolState = {
  isPlaying: false,
  currentTrack: null,
  progress: '0:00',
  duration: '0:00',
  progressPercent: 0,
  trackPosition: null,
  loopMode: 'none',
  shuffle: false,
  trackCount: tracks.length,
  tracks,
}

test('searchTracks returns every case-insensitive substring candidate in queue order', () => {
  assert.deepEqual(searchTracks(tracks, 'LIGHTS').map(t => t.id), ['a1', 'b2'])
  assert.deepEqual(searchTracks(tracks, 'dua').map(t => t.id), ['c3'])
})

test('searchTracks does not split the query into words or guess', () => {
  assert.deepEqual(searchTracks(tracks, 'lights dua'), [])
  assert.deepEqual(searchTracks(tracks, '   '), [])
})

test('playTrack requires an exact trackId instead of matching free text', async () => {
  const execute = getToolExecutor(createMusicPlayerTool(state), 'musicPlayer')
  assert.ok(execute)
  const missing = await execute({ action: 'playTrack' })
  assert.ok(isRecord(missing))
  assert.equal(missing.success, false)
  const played = await execute({ action: 'playTrack', trackId: 'b2' })
  assert.ok(isRecord(played))
  assert.equal(played.success, true)
  assert.equal(played.clientAction, 'PLAY_TRACK')
  assert.equal(played.trackId, 'b2')
})
