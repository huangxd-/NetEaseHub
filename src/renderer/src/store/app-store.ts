import { create } from 'zustand'
import type { AuthState, TrackRef } from '@shared/types'

export type PageKey = 'search' | 'cloud' | 'tasks' | 'settings'

interface AppStore {
  page: PageKey
  setPage: (page: PageKey) => void
  auth: AuthState
  setAuth: (auth: AuthState) => void
  loginOpen: boolean
  setLoginOpen: (open: boolean) => void
  batchTracks: TrackRef[]
  batchOpen: boolean
  openBatch: (tracks: TrackRef[]) => void
  closeBatch: () => void
  disclaimerOpen: boolean
  setDisclaimerOpen: (open: boolean) => void
}

export const useAppStore = create<AppStore>(set => ({
  page: 'search',
  setPage: page => set({ page }),
  auth: { loggedIn: false },
  setAuth: auth => set({ auth }),
  loginOpen: false,
  setLoginOpen: loginOpen => set({ loginOpen }),
  batchTracks: [],
  batchOpen: false,
  openBatch: batchTracks => set({ batchTracks, batchOpen: true }),
  closeBatch: () => set({ batchTracks: [], batchOpen: false }),
  disclaimerOpen: false,
  setDisclaimerOpen: disclaimerOpen => set({ disclaimerOpen })
}))
