import { Mesh, type Intersection, type Raycaster } from 'three'

/**
 * A mesh raycast that ignores hits above `top` (world y): for parts drawn cut off at the top of
 * the floor being edited (tall connectors, the tank's water), so the hidden part above doesn't
 * catch clicks and the click goes through to whatever is behind it.
 */
export function raycastBelow(top: number) {
  return function (this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
    const start = intersects.length
    Mesh.prototype.raycast.call(this, raycaster, intersects)
    for (let i = intersects.length - 1; i >= start; i--) if (intersects[i].point.y > top + 1e-3) intersects.splice(i, 1)
  }
}
