'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import type { PersonalHubState, HubVTOPCommand, PersonalHubSnapshot } from '@/types/hub'
import type {
  DailyBriefingMessage,
  DailyBriefingAction,
  ExamPrompt,
} from '@/lib/hub/daily-briefing'

export type HubPage =
  | 'briefing'
  | 'vtop'
  | 'papers'
  | 'mess'
  | 'placements'
  | 'faculty'
  | 'reddit'
  | 'syllabi'

export type DailyHydrationState = {
  running: boolean
  completed: number
  total: number
}

type HubStoreState = {
  page: HubPage
  hubState: PersonalHubState
  /** False until the server's hub state (streamed to the provider) has been applied. */
  hubStateReady: boolean
  viewerOpen: boolean
  viewerTitle: string
  viewerData: PersonalHubSnapshot | null
  viewerMode: 'static' | 'stream'
  viewerLoading: boolean
  syncing: boolean
  syncCommand: HubVTOPCommand | null
  capabilityLoading: HubVTOPCommand | null
  dailyBriefingActive: boolean
  dailyBriefingTriggered: boolean
  dailyBriefingReady: boolean
  dailyGreeting: string
  dailyMessages: DailyBriefingMessage[]
  dailyMessagesPrepared: boolean
  dailyRevealedCount: number
  dailyExamPrompt: ExamPrompt | null
  dailyBriefingActions: DailyBriefingAction[]
  hydrationCurrentCommand: HubVTOPCommand | null
  dailyHydration: DailyHydrationState
  hydrationQueue: HubVTOPCommand[]
  overlayMode: 'briefing' | 'onboarding' | null
  unlinkedOverlayDismissed: boolean
  sendingBriefingEmail: boolean
}

type HubStoreActions = {
  setState: (
    partial: Partial<HubStoreState> | ((state: HubStoreState) => Partial<HubStoreState>)
  ) => void
  setHubState: (updater: PersonalHubState | ((prev: PersonalHubState) => PersonalHubState)) => void
}

export type HubStore = HubStoreState & HubStoreActions

const defaultHydration: DailyHydrationState = { running: false, completed: 0, total: 0 }

const stripActions = (state: HubStore): HubStoreState => {
  const { setState: _setState, setHubState: _setHubState, ...rest } = state
  return rest
}

export const createHubStore = (
  initialHubState: PersonalHubState,
  hubStateReady = true
): StoreApi<HubStore> =>
  createStore<HubStore>()(set => ({
    page: 'briefing',
    hubState: initialHubState,
    hubStateReady,
    viewerOpen: false,
    viewerTitle: 'result',
    viewerData: null,
    viewerMode: 'static',
    viewerLoading: false,
    syncing: false,
    syncCommand: null,
    capabilityLoading: null,
    dailyBriefingActive: false,
    dailyBriefingTriggered: false,
    dailyBriefingReady: false,
    dailyGreeting: '',
    dailyMessages: [],
    dailyMessagesPrepared: false,
    dailyRevealedCount: 0,
    dailyExamPrompt: null,
    dailyBriefingActions: [],
    hydrationCurrentCommand: null,
    dailyHydration: defaultHydration,
    hydrationQueue: [],
    overlayMode: null,
    unlinkedOverlayDismissed: false,
    sendingBriefingEmail: false,
    setState: updater => {
      if (typeof updater === 'function') {
        set(state => updater(stripActions(state)) as Partial<HubStore>)
      } else {
        set(updater as Partial<HubStore>)
      }
    },
    setHubState: updater => {
      if (typeof updater === 'function') {
        set(state => ({
          hubState: (updater as (prev: PersonalHubState) => PersonalHubState)(state.hubState),
        }))
      } else {
        set({ hubState: updater })
      }
    },
  }))

const EMPTY_HUB_STATE: PersonalHubState = { isLinked: false, snapshots: [], lastSyncedAt: null }

type SeededHubStore = {
  store: StoreApi<HubStore>
  /** The promise the store was seeded from. */
  source: Promise<PersonalHubState>
}

/**
 * A store that starts empty (`hubStateReady: false`) and is seeded when `source` resolves. A
 * rejected source leaves the empty state in place (marked ready, i.e. shown as "not linked").
 */
const createSeededHubStore = (source: Promise<PersonalHubState>): SeededHubStore => {
  const store = createHubStore(EMPTY_HUB_STATE, false)
  source.then(
    hubState => store.setState({ hubState, hubStateReady: true }),
    () => store.setState({ hubStateReady: true })
  )
  return { store, source }
}

const HubStoreContext = createContext<StoreApi<HubStore> | null>(null)

/**
 * Provides the hub store. `initialState` is a promise so pages can stream the hub state instead of
 * blocking render on it (the hub drawer is closed by default): consumers check `hubStateReady`
 * before showing hub data. A new promise (e.g. after a server re-render) replaces the hub state
 * once it resolves.
 */
export function HubStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState: Promise<PersonalHubState>
}) {
  const [{ store, source }] = useState(() => createSeededHubStore(initialState))

  useEffect(() => {
    if (initialState === source) return
    let cancelled = false
    initialState.then(
      hubState => {
        if (!cancelled) store.setState({ hubState, hubStateReady: true })
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [initialState, source, store])

  return <HubStoreContext.Provider value={store}>{children}</HubStoreContext.Provider>
}

export function useHubStore<T>(
  selector: (state: HubStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useContext(HubStoreContext)
  if (!store) {
    throw new Error('useHubStore must be used within a HubStoreProvider')
  }
  // Without an equality function this compares with Object.is, like zustand's `useStore`.
  return useStoreWithEqualityFn(store, selector, equalityFn)
}
