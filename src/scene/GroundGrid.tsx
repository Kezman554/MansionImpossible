import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Color, ShaderMaterial, Vector3 } from 'three'
import { gridLines } from './gridLines'
import { overlayTokens } from './overlayTokens'

interface GroundGridProps {
  plotSize: [number, number]
}

/** Fade band, in metres from the camera, as multiples of the camera's distance to its target. */
const GRID_FADE = {
  major: { start: 0.9, end: 2.6, minStart: 25 },
  minor: { start: 0.5, end: 1.3, minStart: 12 },
} as const

// Line colour with alpha fading out between fadeStart and fadeEnd metres from the camera,
// so distant lines (which shimmer without antialiasing) dissolve into the ground.
const vertexShader = /* glsl */ `
  varying float vDistance;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vDistance = length(viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`
const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float fadeStart;
  uniform float fadeEnd;
  varying float vDistance;
  void main() {
    float fade = 1.0 - smoothstep(fadeStart, fadeEnd, vDistance);
    if (fade <= 0.0) discard;
    gl_FragColor = vec4(color, opacity * fade);
    #include <colorspace_fragment>
  }
`

function fadingLineMaterial(color: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) }, opacity: { value: opacity }, fadeStart: { value: 30 }, fadeEnd: { value: 90 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

const target = new Vector3()

/** 1 m cells, 10 m major lines, over the whole plot; fades with distance. Drawn just above y = 0. */
export function GroundGrid({ plotSize }: GroundGridProps) {
  const lines = useMemo(() => gridLines(plotSize), [plotSize])
  const minorMaterial = useMemo(() => fadingLineMaterial(overlayTokens.ghost, 0.22), [])
  const majorMaterial = useMemo(() => fadingLineMaterial(overlayTokens.edge, 0.4), [])
  const controls = useThree((s) => s.controls) as { target?: Vector3 } | null

  useFrame(({ camera }) => {
    const distance = camera.position.distanceTo(controls?.target ?? target)
    for (const [material, band] of [[majorMaterial, GRID_FADE.major], [minorMaterial, GRID_FADE.minor]] as const) {
      const start = Math.max(band.minStart, distance * band.start)
      material.uniforms.fadeStart.value = start
      material.uniforms.fadeEnd.value = start + distance * (band.end - band.start)
    }
  })

  return (
    <group position-y={0.002}>
      <lineSegments material={minorMaterial}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines.minor, 3]} />
        </bufferGeometry>
      </lineSegments>
      <lineSegments material={majorMaterial}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines.major, 3]} />
        </bufferGeometry>
      </lineSegments>
    </group>
  )
}
