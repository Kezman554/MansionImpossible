import { useEffect } from 'react'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { isTextEntry } from '../store/historyShortcuts'
import { deleteSelection } from './deleteSelection'
import { stepFloor } from './floorActions'

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>
export type EditorAction = 'select-tool' | 'room-tool' | 'door-tool' | 'window-tool' | 'floor-up' | 'floor-down' | 'escape' | 'delete'

/** V select, R room, D door, W window, Page Up/Down = floor, Escape = cancel / deselect, Delete or Backspace = delete selection. */
export function editorActionFor(event: KeyLike): EditorAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) return null
  switch (event.key) {
    case 'v':
    case 'V':
      return 'select-tool'
    case 'r':
    case 'R':
      return 'room-tool'
    case 'd':
    case 'D':
      return 'door-tool'
    case 'w':
    case 'W':
      return 'window-tool'
    case 'PageUp':
      return 'floor-up'
    case 'PageDown':
      return 'floor-down'
    case 'Escape':
      return 'escape'
    case 'Delete':
    case 'Backspace':
      return 'delete'
    default:
      return null
  }
}

export function runEditorAction(action: EditorAction): void {
  const editor = useEditorStore.getState()
  const design = useDesignStore.getState()
  if (action === 'select-tool') editor.setTool('select')
  else if (action === 'room-tool') editor.setTool('room')
  else if (action === 'door-tool') editor.setTool('door')
  else if (action === 'window-tool') editor.setTool('window')
  else if (action === 'floor-up') stepFloor(1)
  else if (action === 'floor-down') stepFloor(-1)
  else if (action === 'delete') deleteSelection()
  else if (editor.draft) editor.setDraft(null)
  else if (editor.selectedOpening) editor.selectOpening(null)
  else if (design.selection.length > 0) design.clearSelection()
  else editor.setTool('select')
}

/** Binds the editor's tool and delete keys while the editor is open. Ignored while a dialog is open. */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const action = editorActionFor(event)
      if (!action) return
      event.preventDefault()
      runEditorAction(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
