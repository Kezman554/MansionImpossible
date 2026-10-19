import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { overlayTokens } from './overlayTokens'
import { elevationOf } from './workPlane'

/** The rectangle being drawn: a coral outline with a light fill, just above the floor. */
export function RoomDraft() {
  const draft = useEditorStore((s) => s.draft)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const floors = useDesignStore((s) => s.design.floors)
  if (!draft) return null
  const y = elevationOf(floors, activeFloor) + 0.04
  const { x0, z0, x1, z1 } = draft

  return (
    <group>
      <Line
        points={[[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]}
        color={overlayTokens.selection}
        lineWidth={2.5}
        depthTest={false}
        renderOrder={10}
      />
      <mesh position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} renderOrder={9} raycast={() => null}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
        <meshBasicMaterial color={overlayTokens.selection} transparent opacity={0.15} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
