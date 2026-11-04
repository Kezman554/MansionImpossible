import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, PMREMGenerator, type DirectionalLight } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { SKY_KEYS, SKY_LIGHT } from '../editor/catalog/lights'
import { colourAt, sunAt } from '../editor/lights'
import type { QualityPreset } from './quality'

interface LightingProps {
  shadows: QualityPreset['shadows']
  plotSize: [number, number]
  /** Hours, 0–24: moves the sun and changes the sky. */
  timeOfDay: number
}

const SUN_DISTANCE = 80
/** Moonlight comes from a fixed high angle in the south-west; it casts no shadows. */
const MOON_POSITION: [number, number, number] = [-30, 60, 40]

/**
 * A generated environment map (Three's RoomEnvironment through PMREM: nothing fetched, works
 * offline) so metals have something to reflect. Its strength follows the daylight.
 */
function SceneEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)
  const texture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0, 0.1, 100, { size: 64 })
    room.dispose()
    pmrem.dispose()
    return target
  }, [gl])
  useEffect(() => {
    get().scene.environment = texture.texture
    return () => {
      get().scene.environment = null
      texture.dispose()
    }
  }, [get, texture])
  useLayoutEffect(() => {
    get().scene.environmentIntensity = intensity
  }, [get, intensity])
  return null
}

/**
 * The sun, the moon, the sky and ambient fill, from the time of day. The sun is the one
 * shadow-casting sky light (when the quality allows shadows); at night it is off, and its shadow
 * map stops updating, so a placed light can take the second shadow slot without extra cost.
 */
export function Lighting({ shadows, plotSize, timeOfDay }: LightingProps) {
  // Shadow camera covers the central part of the plot where the mansion sits.
  const reach = Math.min(60, Math.max(plotSize[0], plotSize[1]) / 2)
  const get = useThree((s) => s.get)
  const sunLight = useRef<DirectionalLight>(null)
  const sun = sunAt(timeOfDay)
  const night = 1 - sun.daylight
  const sky = colourAt(SKY_KEYS, timeOfDay)
  const sunColour = useMemo(() => new Color(SKY_LIGHT.lowSun).lerp(new Color(SKY_LIGHT.sun), Math.min(1, Math.max(0, sun.height * 2.5))), [sun.height])
  const ambientColour = useMemo(() => new Color(SKY_LIGHT.night).lerp(new Color(SKY_LIGHT.day), sun.daylight), [sun.daylight])

  // The sky is the viewport background (scene data; at night it nears the chrome's ground).
  useLayoutEffect(() => {
    get().scene.background = new Color(sky)
  }, [get, sky])
  useLayoutEffect(() => {
    if (sunLight.current) sunLight.current.shadow.autoUpdate = sun.daylight > 0
  }, [sun.daylight])

  const [dx, dy, dz] = sun.direction
  return (
    <>
      <SceneEnvironment intensity={0.08 + 0.5 * sun.daylight} />
      <ambientLight name="ambient" intensity={0.12 + 0.43 * sun.daylight} color={ambientColour} />
      <directionalLight
        ref={sunLight}
        name="sun"
        position={[dx * SUN_DISTANCE, Math.max(dy, 0.05) * SUN_DISTANCE, dz * SUN_DISTANCE]}
        intensity={1.8 * sun.daylight}
        color={sunColour}
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
      <directionalLight name="moon" position={MOON_POSITION} intensity={0.25 * night} color={SKY_LIGHT.moon} />
    </>
  )
}
