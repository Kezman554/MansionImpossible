import { Plane, Ray, Vector3 } from 'three'

const plane = new Plane()
const hit = new Vector3()

/** Where a pointer ray meets the horizontal plane y = height, or null if it never does. */
export function pointAtHeight(ray: Ray, height: number): { x: number; z: number } | null {
  plane.set(new Vector3(0, 1, 0), -height)
  return ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null
}

/** Pointer moves under this many pixels count as a click, not a drag. */
export const CLICK_TOLERANCE_PX = 4

export function elevationOf(floors: { index: number; elevation: number }[], index: number): number {
  return floors.find((f) => f.index === index)?.elevation ?? index * 3
}
