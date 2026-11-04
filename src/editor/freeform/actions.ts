// Freeform commands as the user gives them.
import { useDesignStore } from '../../store/designStore'
import { useEditorStore } from '../../store/editorStore'
import { duplicateLights } from '../lights'
import { DUPLICATE_OFFSET, duplicatePieces } from './pieces'

/** Copies the selected pieces and lights one grid step along and selects the copies (one undo step). */
export function duplicateSelection(): void {
  const store = useDesignStore.getState()
  const pieceIds = store.selection.filter((id) => store.design.pieces.some((p) => p.id === id))
  const lightIds = store.selection.filter((id) => (store.design.lights ?? []).some((l) => l.id === id))
  if (pieceIds.length + lightIds.length === 0) return
  const pieces = duplicatePieces(store.design, pieceIds)
  const lights = duplicateLights(pieces.design, lightIds, DUPLICATE_OFFSET)
  store.applyDesign(lights.design)
  useDesignStore.getState().select([...pieces.ids, ...lights.ids])
  useEditorStore.getState().selectOpening(null)
}

/** The design's grid snapping (status bar, tray toggle). A preference, so not an undo step. */
export function setSnap(on: boolean): void {
  const store = useDesignStore.getState()
  store.applyDesign({ ...store.design, settings: { ...store.design.settings, snapToGrid: on } }, { record: false })
}

/**
 * The design's time of day (status bar slider). Saved with the design but, like Snap, a view
 * setting rather than an edit, so dragging the slider adds no undo steps.
 */
export function setTimeOfDay(hours: number): void {
  const store = useDesignStore.getState()
  const timeOfDay = Math.min(24, Math.max(0, Math.round(hours * 4) / 4))
  if (timeOfDay === store.design.settings.timeOfDay) return
  store.applyDesign({ ...store.design, settings: { ...store.design.settings, timeOfDay } }, { record: false })
}

export function setPieceMaterial(ids: string[], material: string): void {
  const store = useDesignStore.getState()
  store.applyDesign({ ...store.design, pieces: store.design.pieces.map((p) => (ids.includes(p.id) ? { ...p, material } : p)) })
}
