import { useMemo } from 'react'
import { gridLines } from './gridLines'
import { overlayTokens } from './overlayTokens'

interface GroundGridProps {
  plotSize: [number, number]
}

/** 1 m cells, 10 m major lines, over the whole plot. Drawn just above y = 0 to avoid z-fighting. */
export function GroundGrid({ plotSize }: GroundGridProps) {
  const lines = useMemo(() => gridLines(plotSize), [plotSize])

  return (
    <group position-y={0.002} renderOrder={1}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines.minor, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={overlayTokens.ghost} transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines.major, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={overlayTokens.edge} transparent opacity={0.4} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
