import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { newRoom, rectFromDrag } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { elevationOf, pointAtHeight } from './workPlane'

/**
 * Pointer handlers for the ground: with the room tool, drag a rectangle (snapped to
 * 0.5 m) on the active floor; on release it becomes a room — one undo step — and is selected.
 */
export function useRoomDrawing() {
  const start = useRef<{ x: number; z: number } | null>(null)

  const floorHeight = () => {
    const { activeFloor } = useEditorStore.getState()
    return elevationOf(useDesignStore.getState().design.floors, activeFloor)
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (useEditorStore.getState().tool !== 'room' || e.button !== 0) return
    const p = pointAtHeight(e.ray, floorHeight())
    if (!p) return
    start.current = p
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!start.current) return
    const p = pointAtHeight(e.ray, floorHeight())
    if (p) useEditorStore.getState().setDraft(rectFromDrag(start.current, p))
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!start.current) return
    start.current = null
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
    const editor = useEditorStore.getState()
    const rect = editor.draft
    editor.setDraft(null)
    if (!rect) return
    const store = useDesignStore.getState()
    const floor = store.design.floors.find((f) => f.index === editor.activeFloor)
    const id = store.addObject(newRoom(rect, editor.activeFloor, store.design.rooms, floor?.height))
    store.select(id)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}
