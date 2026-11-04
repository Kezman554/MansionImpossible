import type { ThreeEvent } from '@react-three/fiber'
import { newLight } from '../editor/lights'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { pieceSnap } from './usePiecePlacement'
import { CLICK_TOLERANCE_PX, elevationOf, pointAtHeight } from './workPlane'

/**
 * The light tool on the active floor: a click places the chosen light (lamps on the floor, the
 * rest under the ceiling) in the chosen colour, as one undo step, and selects it.
 */
export function useLightPlacement() {
  const onClick = (e: ThreeEvent<MouseEvent>): boolean => {
    const editor = useEditorStore.getState()
    if (editor.tool !== 'light' || e.delta > CLICK_TOLERANCE_PX) return false
    const store = useDesignStore.getState()
    const floor = store.design.floors.find((f) => f.index === editor.activeFloor)
    const p = pointAtHeight(e.ray, elevationOf(store.design.floors, editor.activeFloor))
    if (!p) return false
    e.stopPropagation()
    const id = store.addObject(newLight(editor.lightType, floor, p, pieceSnap(), editor.lightColour))
    editor.selectOpening(null)
    useDesignStore.getState().select(id)
    return true
  }
  return { onClick }
}
