import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClubData } from './types'
import { buildEmpty, buildSeed } from './seed'

interface Store {
  data: ClubData
  /** Apply a pure operation from ops.ts (or any data => data function). */
  apply: (fn: (d: ClubData) => ClubData) => void
  /** Shallow-patch one collection or settings with an updater. */
  set: <K extends keyof ClubData>(key: K, updater: (v: ClubData[K]) => ClubData[K]) => void
  replace: (d: ClubData) => void
  resetDemo: () => void
  startFresh: () => void
}

export const useClub = create<Store>()(
  persist(
    (set) => ({
      data: buildSeed(),
      apply: (fn) => set((s) => ({ data: fn(s.data) })),
      set: (key, updater) => set((s) => ({ data: { ...s.data, [key]: updater(s.data[key]) } })),
      replace: (d) => set({ data: d }),
      resetDemo: () => set({ data: buildSeed() }),
      startFresh: () => set({ data: buildEmpty() }),
    }),
    { name: 'dugout-hq-v1', version: 1 },
  ),
)

export const useData = () => useClub((s) => s.data)
