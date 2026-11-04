// One unit geometry per piece shape, shared by every instance of it. Each fills the box
// x ∈ [-0.5, 0.5], y ∈ [0, 1], z ∈ [-0.5, 0.5] (origin at the middle of the base), so an
// instance's scale is simply its size in metres.
import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Path, Shape, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PieceType } from '../../types/design'

const SEGMENTS = 20

function box(): BufferGeometry {
  return new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
}

/** Extrudes a profile drawn in x ∈ [-0.5, 0.5], y ∈ [0, 1] through z ∈ [-0.5, 0.5]. */
function extrude(shape: Shape): BufferGeometry {
  return new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: SEGMENTS }).translate(0, 0, -0.5)
}

function arch(): BufferGeometry {
  const outline = new Shape().moveTo(-0.5, 0).lineTo(0.5, 0).lineTo(0.5, 1).lineTo(-0.5, 1).closePath()
  // The opening: legs a fifth of the width, a round head reaching 85% of the height.
  const r = 0.3
  const spring = 0.85 - r
  const hole = new Path().moveTo(-r, 0).lineTo(-r, spring).absarc(0, spring, r, Math.PI, 0, true).lineTo(r, 0).lineTo(-r, 0)
  outline.holes.push(hole)
  return extrude(outline)
}

function ramp(): BufferGeometry {
  return extrude(new Shape().moveTo(-0.5, 0).lineTo(0.5, 0).lineTo(0.5, 1).closePath())
}

/** A corridor along x: floor, ceiling and two side walls, open at both ends. */
function passage(): BufferGeometry {
  const parts = [
    new BoxGeometry(1, 0.05, 1).translate(0, 0.025, 0),
    new BoxGeometry(1, 0.05, 1).translate(0, 0.975, 0),
    new BoxGeometry(1, 0.9, 0.08).translate(0, 0.5, -0.46),
    new BoxGeometry(1, 0.9, 0.08).translate(0, 0.5, 0.46),
  ]
  const merged = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return merged
}

const builders: Partial<Record<PieceType, () => BufferGeometry>> = {
  wall: box,
  'floor-panel': box,
  platform: box,
  pillar: () => new CylinderGeometry(0.5, 0.5, 1, SEGMENTS).translate(0, 0.5, 0),
  dome: () => new SphereGeometry(0.5, SEGMENTS * 2, SEGMENTS / 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  // Open-ended and lying along x, so tubes join end to end into corridors.
  tube: () => new CylinderGeometry(0.5, 0.5, 1, SEGMENTS * 2, 1, true).rotateZ(Math.PI / 2).translate(0, 0.5, 0),
  arch,
  ramp,
  'bookcase-passage': passage,
}

const cache = new Map<PieceType, BufferGeometry>()

/** Shared unit geometry for a piece type (pieces without a shape yet are boxes). Never dispose it. */
export function pieceGeometry(type: PieceType): BufferGeometry {
  let geometry = cache.get(type)
  if (!geometry) {
    geometry = (builders[type] ?? box)()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    cache.set(type, geometry)
  }
  return geometry
}

/** Shapes seen from inside as well as outside (open tubes, the inside of a dome). */
export const DOUBLE_SIDED: ReadonlySet<PieceType> = new Set(['tube', 'dome'])
