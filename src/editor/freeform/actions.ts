// Freeform commands as the user gives them.
import { useDesignStore } from '../../store/designStore'
import { useEditorStore } from '../../store/editorStore'
import { duplicatePieces } from './pieces'

/** Copies the selected pieces one grid step along and selects the copies (one undo step). */
export function duplicateSelection(): void {
  const store = useDesignStore.getState()
  const pieceIds = store.selection.filter((id) => store.design.pieces.some((p) => p.id === id))
  if (pieceIds.length === 0) return
  const { design, ids } = duplicatePieces(store.design, pieceIds)
  store.applyDesign(design)
  useDesignStore.getState().select(ids)
  useEditorStore.getState().selectOpening(null)
}

/** The design's grid snapping (status bar, tray toggle). A preference, so not an undo step. */
export function setSnap(on: boolean): void {
  const store = useDesignStore.getState()
  store.applyDesign({ ...store.design, settings: { ...store.design.settings, snapToGrid: on } }, { record: false })
}

export function setPieceMaterial(ids: string[], material: string): void {
  const store = useDesignStore.getState()
  store.applyDesign({ ...store.design, pieces: store.design.pieces.map((p) => (ids.includes(p.id) ? { ...p, material } : p)) })
}
