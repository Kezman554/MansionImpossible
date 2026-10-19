import { create } from 'zustand'
import type { Design } from '../types/design'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  tone: 'saved' | 'plain'
  /** One button, e.g. Undo after a delete. */
  action?: ToastAction
}

/** A failed write. Persistent until a save succeeds (DESIGN.md: a banner, never a toast). */
export interface SaveProblem {
  message: string
  /** The design that didn't save, for Export JSON. */
  design: Design | null
  retry: () => void
}

export const TOAST_MS = { saved: 2000, plain: 5000 } as const

interface AppState {
  toast: Toast | null
  saveProblem: SaveProblem | null
  showToast: (message: string, tone?: Toast['tone'], action?: ToastAction) => void
  dismissToast: (id: number) => void
  reportSaveProblem: (error: unknown, design: Design | null, retry: () => void) => void
  clearSaveProblem: () => void
}

export function saveErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return "Couldn't save — this browser's storage is full"
  }
  const detail = error instanceof Error && error.message ? error.message : 'something went wrong'
  return `Couldn't save — ${detail}`
}

let nextToastId = 1

export const useAppStore = create<AppState>()((set, get) => ({
  toast: null,
  saveProblem: null,

  showToast: (message, tone = 'plain', action) => {
    // A routine Saved never pushes out a toast the user may still act on (Undo).
    if (tone === 'saved' && get().toast?.action) return
    const id = nextToastId++
    set({ toast: { id, message, tone, action } })
    setTimeout(() => get().dismissToast(id), TOAST_MS[tone])
  },

  dismissToast: (id) => {
    if (get().toast?.id === id) set({ toast: null })
  },

  reportSaveProblem: (error, design, retry) => {
    console.error('Save failed', error)
    set({ saveProblem: { message: saveErrorMessage(error), design, retry } })
  },

  clearSaveProblem: () => set({ saveProblem: null }),
}))
