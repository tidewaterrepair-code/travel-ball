import { create, type StateCreator } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClubData } from './types'
import { buildEmpty, buildSeed } from './seed'
import { IS_CLUB } from './mode'
import { bindStore, enqueue } from './sync'

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

const base: StateCreator<Store> = (set, get) => {
  // In a real club every change is also queued for the server. Because changes are
  // pure functions, they can be replayed on top of someone else's newer save.
  const apply = (fn: (d: ClubData) => ClubData) => {
    set({ data: fn(get().data) })
    if (IS_CLUB) enqueue(fn)
  }
  return {
    data: IS_CLUB ? buildEmpty() : buildSeed(),
    apply,
    set: (key, updater) => apply((d) => ({ ...d, [key]: updater(d[key]) })),
    replace: (d) => apply(() => d),
    resetDemo: () => set({ data: buildSeed() }),
    startFresh: () => set({ data: buildEmpty() }),
  }
}

// The demo keeps its data in this browser; real clubs keep it on the server.
export const useClub = IS_CLUB
  ? create<Store>()(base)
  : create<Store>()(persist(base as never, { name: 'dugout-hq-v1', version: 1 }) as unknown as StateCreator<Store>)

export const useData = () => useClub((s) => s.data)

if (IS_CLUB) {
  bindStore(
    () => useClub.getState().data,
    (d) => useClub.setState({ data: d }),
    (message) => window.dispatchEvent(new CustomEvent('dugout:rejected', { detail: message })),
  )
}
