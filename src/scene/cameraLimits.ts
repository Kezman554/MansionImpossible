import { Vector3 } from 'three'

// Editor orbit camera limits, in metres and radians.
export const CAMERA_LIMITS = {
  minDistance: 1.5,
  maxDistance: 350,
  /** Stops just above the horizon so the camera never dips under the ground plane. */
  maxPolarAngle: Math.PI / 2 - 0.04,
  /** How far above / below ground the orbit target may go (tall towers, deep basements). */
  minTargetY: -40,
  maxTargetY: 120,
} as const

export const DEFAULT_CAMERA = { position: new Vector3(28, 22, 28), target: new Vector3(0, 0, 0) }

/**
 * Keeps the orbit target over the plot (terrain extent) and within the height band.
 * Returns how far the target moved, so the camera can move with it and keep its view.
 */
export function clampTarget(target: Vector3, plotSize: [number, number]): Vector3 {
  const before = target.clone()
  const [halfX, halfZ] = [plotSize[0] / 2, plotSize[1] / 2]
  target.set(
    Math.min(halfX, Math.max(-halfX, target.x)),
    Math.min(CAMERA_LIMITS.maxTargetY, Math.max(CAMERA_LIMITS.minTargetY, target.y)),
    Math.min(halfZ, Math.max(-halfZ, target.z)),
  )
  return target.clone().sub(before)
}
