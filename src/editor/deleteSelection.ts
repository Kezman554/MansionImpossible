import { useAppStore } from '../store/appStore'
import { findObject, useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { pieceLabel } from './freeform/catalog'
import { OPENING_STYLES } from './openings'

const offerUndo = (label: string) =>
  useAppStore.getState().showToast(`${label} deleted`, 'plain', { label: 'Undo', run: () => useDesignStore.getState().undo() })

/**
 * Deletes the selected opening, or else the selected objects, without asking
 * (CLAUDE.md: anything undoable never confirms) and shows a toast whose Undo puts it back.
 */
export function deleteSelection(): void {
  const store = useDesignStore.getState()
  const editor = useEditorStore.getState()

  const ref = editor.selectedOpening
  const room = ref && store.design.rooms.find((r) => r.id === ref.roomId)
  const opening = room?.openings.find((o) => o.id === ref?.openingId)
  if (room && opening) {
    store.updateObject(room.id, { openings: room.openings.filter((o) => o.id !== opening.id) })
    editor.selectOpening(null)
    offerUndo(OPENING_STYLES[opening.style].label)
    return
  }

  const objects = store.selection.map((id) => findObject(store.design, id)).filter((o) => o !== undefined)
  const tank = store.design.tank && store.selection.includes(store.design.tank.id) ? store.design.tank : null
  const count = objects.length + (tank ? 1 : 0)
  if (count === 0) return
  store.removeObjects([...objects.map((o) => o.id), ...(tank ? [tank.id] : [])])
  const only = count === 1 ? objects[0] : null
  offerUndo(count > 1 ? `${count} objects` : tank ? 'Fish tank' : !only ? 'Object' : 'name' in only ? only.name : only.kind === 'piece' ? pieceLabel(only.type) : 'Furniture')
}
