import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { overlayTokens } from './overlayTokens'
import { elevationOf } from './workPlane'

const CIRCLE = 48

/** The room being drawn: a coral outline with a light fill, just above the floor (a circle for round rooms). */
export function RoomDraft() {
  const draft = useEditorStore((s) => s.draft)
  const shape = useEditorStore((s) => s.roomShape)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const floors = useDesignStore((s) => s.design.floors)
  if (!draft) return null
  const y = elevationOf(floors, activeFloor) + 0.04
  const { x0, z0, x1, z1 } = draft
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2]
  const r = Math.max(x1 - x0, z1 - z0) / 2
  const points: [number, number, number][] =
    shape === 'round'
      ? Array.from({ length: CIRCLE + 1 }, (_, i) => [cx + Math.cos((i / CIRCLE) * Math.PI * 2) * r, y, cz + Math.sin((i / CIRCLE) * Math.PI * 2) * r])
      : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]

  return (
    <group>
      <Line points={points} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} />
      <mesh position={[cx, y, cz]} rotation-x={-Math.PI / 2} renderOrder={9} raycast={() => null}>
        {shape === 'round' ? <circleGeometry args={[r, CIRCLE]} /> : <planeGeometry args={[x1 - x0, z1 - z0]} />}
        <meshBasicMaterial color={overlayTokens.selection} transparent opacity={0.15} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
