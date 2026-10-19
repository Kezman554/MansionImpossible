import type { ThreeEvent } from '@react-three/fiber'
import { overlayTokens } from './overlayTokens'

interface GroundProps {
  plotSize: [number, number]
  /** Ground-plane point under the pointer, in metres; null when it leaves the plot. */
  onCursor: (point: { x: number; z: number } | null) => void
}

/** Flat stand-in for the terrain: catches shadows and reports the cursor position. */
export function Ground({ plotSize, onCursor }: GroundProps) {
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => onCursor({ x: event.point.x, z: event.point.z })

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerMove={onPointerMove} onPointerOut={() => onCursor(null)}>
      <planeGeometry args={plotSize} />
      <shadowMaterial color={overlayTokens.shadow} opacity={0.6} />
    </mesh>
  )
}
