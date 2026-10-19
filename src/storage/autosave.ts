import { useAppStore } from '../store/appStore'
import { useDesignStore } from '../store/designStore'
import type { Design } from '../types/design'
import { saveDesign } from './designDb'

export const AUTOSAVE_DELAY = 800

export interface Autosave {
  /** Loads a design into the editor; it counts as already saved. */
  open: (design: Design) => void
  /** Saves any pending change now. Resolves false if the save failed. */
  flush: () => Promise<boolean>
  /** Flushes, then stops saving. Resolves false (and stays open) if the final save failed. */
  close: () => Promise<boolean>
  stop: () => void
}

/**
 * Saves the open design to IndexedDB a short while after each change, one save
 * at a time. Success shows a brief Saved toast; failure raises the save banner,
 * whose Try again flushes again.
 */
export function createAutosave({ delay = AUTOSAVE_DELAY, save = saveDesign } = {}): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastSaved: Design | null = null
  let active = false
  let queue: Promise<boolean> = Promise.resolve(true)

  const unsubscribe = useDesignStore.subscribe((state, previous) => {
    if (!active || state.design === previous.design || state.design === lastSaved) return
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  })

  function flush(): Promise<boolean> {
    clearTimeout(timer)
    queue = queue.then(async () => {
      const design = useDesignStore.getState().design
      if (!active || design === lastSaved) return true
      const app = useAppStore.getState()
      try {
        await save(design)
        lastSaved = design
        app.clearSaveProblem()
        app.showToast('Saved', 'saved')
        return true
      } catch (error) {
        app.reportSaveProblem(error, design, () => void flush())
        return false
      }
    })
    return queue
  }

  return {
    open(design) {
      clearTimeout(timer)
      lastSaved = design
      active = true
      useDesignStore.getState().loadDesign(design)
    },
    flush,
    async close() {
      const saved = await flush()
      if (saved) active = false
      return saved
    },
    stop() {
      clearTimeout(timer)
      active = false
      unsubscribe()
    },
  }
}

export const autosave = createAutosave()
