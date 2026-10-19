import { useEffect } from 'react'
import { useDesignStore } from './designStore'

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'>

/** Ctrl/Cmd+Z = undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z = redo. Text fields keep their own undo. */
export function historyActionFor(event: KeyLike): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  if (isTextEntry(event.target)) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}

/** Text fields, selects and contenteditable keep their own keys. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Binds the undo/redo shortcuts to the window while mounted. */
export function useHistoryShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = historyActionFor(event)
      if (!action) return
      event.preventDefault()
      useDesignStore.getState()[action]()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
