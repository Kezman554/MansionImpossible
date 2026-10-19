// Floor changes as the user makes them: each is one undo step on the design store, and the
// active floor follows along. Removing never asks (it can be undone); a toast offers Undo.
import { useAppStore } from '../store/appStore'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { addFloor, floorContents, nearestFloor, removeFloor, renameFloor, setFloorHeight } from './floors'

/** Adds a floor on top, or a basement underneath, and switches to it. */
export function addFloorAndSwitch(where: 'above' | 'below'): void {
  const { design, index } = addFloor(useDesignStore.getState().design, where)
  useDesignStore.getState().applyDesign(design)
  useEditorStore.getState().setActiveFloor(index)
}

export function removeFloorWithUndo(index: number): void {
  const store = useDesignStore.getState()
  const floor = store.design.floors.find((f) => f.index === index)
  if (!floor || store.design.floors.length <= 1) return
  const objects = floorContents(store.design, index)
  const next = removeFloor(store.design, index)
  store.applyDesign(next)
  useEditorStore.getState().setActiveFloor(nearestFloor(next.floors, index > 0 ? index - 1 : index < 0 ? index + 1 : 0))
  const what = objects ? ` and ${objects} ${objects === 1 ? 'thing' : 'things'} on it` : ''
  useAppStore.getState().showToast(`${floor.name}${what} removed`, 'plain', { label: 'Undo', run: () => useDesignStore.getState().undo() })
}

export function renameFloorTo(index: number, name: string): void {
  const store = useDesignStore.getState()
  store.applyDesign(renameFloor(store.design, index, name))
}

export function changeFloorHeight(index: number, height: number): void {
  const store = useDesignStore.getState()
  store.applyDesign(setFloorHeight(store.design, index, height))
}

/** Moves the active floor up or down one, if there is one. */
export function stepFloor(direction: 1 | -1): void {
  const editor = useEditorStore.getState()
  const target = editor.activeFloor + direction
  if (useDesignStore.getState().design.floors.some((f) => f.index === target)) editor.setActiveFloor(target)
}
