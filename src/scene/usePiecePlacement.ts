import type { ThreeEvent } from '@react-three/fiber'
import { newPiece } from '../editor/freeform/pieces'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Piece } from '../types/design'
import { gizmoHasPointer } from './gizmoState'
import { elevationOf, pointAtHeight } from './workPlane'

/** The grid step pieces snap to, or null when snapping is off (the design's Snap setting). */
export function pieceSnap(): number | null {
  const { snapToGrid, gridSize } = useDesignStore.getState().design.settings
  return snapToGrid ? gridSize : null
}

/**
 * The freeform tool's placement: hovering previews the chosen piece, clicking places it on the
 * active floor — or on top of the piece under the pointer, at that height. Each placement is
 * one undo step and selects the new piece.
 */
export function usePiecePlacement() {
  const placing = () => useEditorStore.getState().tool === 'freeform'

  /** Base point for a new piece: on top of a piece's upward face, else on the active floor. */
  const pointFor = (e: ThreeEvent<PointerEvent | MouseEvent>, onPiece: boolean) => {
    const { design } = useDesignStore.getState()
    const elevation = elevationOf(design.floors, useEditorStore.getState().activeFloor)
    if (onPiece && e.face) {
      const up = e.face.normal.clone().transformDirection(e.object.matrixWorld).y
      if (up > 0.7) return { x: e.point.x, y: e.point.y - elevation, z: e.point.z }
    }
    const p = pointAtHeight(e.ray, elevation)
    return p && { ...p, y: 0 }
  }

  const candidate = (e: ThreeEvent<PointerEvent | MouseEvent>, onPiece: boolean) => {
    const at = pointFor(e, onPiece)
    if (!at) return null
    const editor = useEditorStore.getState()
    return newPiece(editor.pieceType, editor.activeFloor, at, pieceSnap()) as Omit<Piece, 'id'>
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>, onPiece = false) => {
    if (!placing()) return
    if (onPiece) e.stopPropagation()
    const next = candidate(e, onPiece)
    const current = useEditorStore.getState().piecePreview
    if (!next) return useEditorStore.getState().setPiecePreview(null)
    if (current?.type === next.type && current.position.every((v, i) => v === next.position[i])) return
    useEditorStore.getState().setPiecePreview(next)
  }

  const onClick = (e: ThreeEvent<MouseEvent>, onPiece = false) => {
    if (!placing() || e.delta > 4 || gizmoHasPointer()) return false
    e.stopPropagation()
    const piece = candidate(e, onPiece)
    if (!piece) return false
    const store = useDesignStore.getState()
    const id = store.addObject(piece)
    store.select(id)
    useEditorStore.getState().selectOpening(null)
    return true
  }

  return { onPointerMove, onClick }
}
