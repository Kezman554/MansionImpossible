import { useAppStore } from '../store/appStore'
import { findObject, useDesignStore } from '../store/designStore'

/**
 * Deletes the selected objects without asking (CLAUDE.md: anything undoable never confirms)
 * and shows a toast whose Undo puts them back.
 */
export function deleteSelection(): void {
  const store = useDesignStore.getState()
  const objects = store.selection.map((id) => findObject(store.design, id)).filter((o) => o !== undefined)
  if (objects.length === 0) return
  store.removeObjects(objects.map((o) => o.id))
  const only = objects.length === 1 ? objects[0] : null
  const label = only && 'name' in only ? only.name : `${objects.length} objects`
  useAppStore.getState().showToast(`${label} deleted`, 'plain', { label: 'Undo', run: () => useDesignStore.getState().undo() })
}
