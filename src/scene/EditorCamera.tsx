import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import { MOUSE, type Vector3 } from 'three'
import { CAMERA_LIMITS, clampTarget } from './cameraLimits'

export interface CameraState {
  position: Vector3
  target: Vector3
}

interface EditorCameraProps {
  /** Shared across Canvas remounts (a quality change), so the view doesn't jump. */
  state: CameraState
  plotSize: [number, number]
}

/** Orbit camera: left-drag rotates, right-drag pans, wheel zooms toward the cursor. */
export function EditorCamera({ state, plotSize }: EditorCameraProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    camera.position.copy(state.position)
    controls.current?.target.copy(state.target)
    controls.current?.update()
  }, [camera, state])

  const onChange = () => {
    const c = controls.current
    if (!c) return
    const moved = clampTarget(c.target, plotSize)
    if (moved.lengthSq() > 0) c.object.position.add(moved)
    state.position.copy(c.object.position)
    state.target.copy(c.target)
  }

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      zoomToCursor
      screenSpacePanning={false}
      minDistance={CAMERA_LIMITS.minDistance}
      maxDistance={CAMERA_LIMITS.maxDistance}
      maxPolarAngle={CAMERA_LIMITS.maxPolarAngle}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      onChange={onChange}
    />
  )
}
