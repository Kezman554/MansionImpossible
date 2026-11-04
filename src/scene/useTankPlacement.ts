import type { ThreeEvent } from '@react-three/fiber'
import { placeTank, snapTankCentre } from '../editor/tank'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { CLICK_TOLERANCE_PX, elevationOf, pointAtHeight } from './workPlane'

/**
 * The fish tank tool on the ground: hovering previews where the tank's centre goes, clicking
 * places it (or moves the design's one tank there), selects it and returns to the select tool.
 */
export function useTankPlacement() {
  const placing = () => useEditorStore.getState().tool === 'tank'
  const pointFor = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = pointAtHeight(e.ray, elevationOf(useDesignStore.getState().design.floors, useEditorStore.getState().activeFloor))
    return p && snapTankCentre(p)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!placing()) return
    const next = pointFor(e)
    const current = useEditorStore.getState().tankPreview
    if (next?.x === current?.x && next?.z === current?.z) return
    useEditorStore.getState().setTankPreview(next)
  }

  const onClick = (e: ThreeEvent<MouseEvent>): boolean => {
    if (!placing() || e.delta > CLICK_TOLERANCE_PX) return false
    e.stopPropagation()
    const p = pointAtHeight(e.ray, elevationOf(useDesignStore.getState().design.floors, useEditorStore.getState().activeFloor))
    if (!p) return false
    const store = useDesignStore.getState()
    const next = placeTank(store.design, p)
    store.applyDesign(next)
    useEditorStore.getState().setTool('select')
    useEditorStore.getState().selectOpening(null)
    store.select(next.tank!.id)
    return true
  }

  return { onPointerMove, onClick }
}
