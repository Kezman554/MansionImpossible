import type { QualityPreset } from './quality'

interface LightingProps {
  shadows: QualityPreset['shadows']
  plotSize: [number, number]
}

const SUN_POSITION: [number, number, number] = [40, 60, 25]

/** Ambient fill plus one directional sun — the only shadow-casting light. */
export function Lighting({ shadows, plotSize }: LightingProps) {
  // Shadow camera covers the central part of the plot where the mansion sits.
  const reach = Math.min(60, Math.max(plotSize[0], plotSize[1]) / 2)

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={SUN_POSITION}
        intensity={1.6}
        castShadow={shadows !== false}
        shadow-mapSize={shadows ? [shadows.mapSize, shadows.mapSize] : undefined}
        shadow-radius={shadows ? shadows.radius : undefined}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
    </>
  )
}
