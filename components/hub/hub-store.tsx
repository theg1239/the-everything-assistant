'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
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

export const createHubStore = (initialHubState: PersonalHubState): StoreApi<HubStore> =>
  createStore<HubStore>()((set, get) => ({
    page: 'briefing',
    hubState: initialHubState,
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

const HubStoreContext = createContext<StoreApi<HubStore> | null>(null)

export function HubStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState: PersonalHubState
}) {
  const storeRef = useRef<StoreApi<HubStore>>()
  if (!storeRef.current) {
    storeRef.current = createHubStore(initialState)
  }

  useEffect(() => {
    storeRef.current?.getState().setHubState(initialState)
  }, [initialState])

  return <HubStoreContext.Provider value={storeRef.current}>{children}</HubStoreContext.Provider>
}

export function useHubStore<T>(
  selector: (state: HubStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useContext(HubStoreContext)
  if (!store) {
    throw new Error('useHubStore must be used within a HubStoreProvider')
  }
  if (equalityFn) {
    return useStoreWithEqualityFn(store, selector, equalityFn)
  }
  return useStore(store, selector)
}
