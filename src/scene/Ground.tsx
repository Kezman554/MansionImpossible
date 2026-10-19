import type { ThreeEvent } from '@react-three/fiber'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { overlayTokens } from './overlayTokens'
import { useRoomDrawing } from './useRoomDrawing'
import { CLICK_TOLERANCE_PX, pointAtHeight } from './workPlane'

interface GroundProps {
  plotSize: [number, number]
  /** Height of the active floor: the cursor position is read on its plane. */
  elevation: number
  /** Point under the pointer on the active floor's plane, in metres; null when it leaves the plot. */
  onCursor: (point: { x: number; z: number } | null) => void
}

/**
 * Flat stand-in for the terrain: catches shadows, reports the cursor position,
 * takes room-tool drags, and clears the selection when clicked with the select tool.
 */
export function Ground({ plotSize, elevation, onCursor }: GroundProps) {
  const drawing = useRoomDrawing()

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    onCursor(pointAtHeight(e.ray, elevation))
    drawing.onPointerMove(e)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useEditorStore.getState().tool !== 'select' || e.delta > CLICK_TOLERANCE_PX) return
    useDesignStore.getState().clearSelection()
    useEditorStore.getState().selectOpening(null)
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      receiveShadow
      onPointerDown={drawing.onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drawing.onPointerUp}
      onPointerCancel={drawing.onPointerCancel}
      onPointerOut={() => onCursor(null)}
      onClick={onClick}
    >
      <planeGeometry args={plotSize} />
      <shadowMaterial color={overlayTokens.shadow} opacity={0.6} />
    </mesh>
  )
}
