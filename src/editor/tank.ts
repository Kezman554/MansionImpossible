// The central fish tank: placing, moving, shaping and sizing it, its height through the floors,
// and where room walls touch it. Pure functions over plain data, like the room tool.
//
// The tank is a single core object. Its footprint is stored; its height is not — it always runs
// from the bottom of the lowest floor to the top of the highest, so adding, removing or resizing
// floors resizes it. Aquarium walls are derived the same way: whenever rooms or the tank change,
// the walls touching it are worked out again when drawn (see layoutFloorWalls).
import { newId } from '../store/designStore'
import type { Design, Floor, FishTank, TankShape } from '../types/design'
import type { Rect } from './roomTool'

/** Grid snap for placing and moving the tank, in metres (same as rooms, so walls line up). */
export const TANK_SNAP = 0.5
export const DEFAULT_TANK_SIZE: [number, number] = [4, 4]
export const TANK_LIMITS = { side: { min: 1, max: 60 } } as const
/** A wall whose face stands up to this far off the glass still counts as touching, in metres. */
export const TANK_CONTACT_GAP = 0.1
/**
 * Shortest stretch that turns to glass, in metres (and never less than the wall's thickness):
 * a wall that meets the tank only at a corner square, or grazes a cylinder off its tangent,
 * stays solid instead of leaving a sliver of glass.
 */
export const TANK_MIN_CONTACT = 0.25
/** How far round a cylinder a flat wall's glass reaches past the touching line, in metres. */
export const CYLINDER_WINDOW_REACH = 0.6

export const TANK_SHAPES: { value: TankShape; label: string }[] = [
  { value: 'rectangular', label: 'Rectangular' },
  { value: 'cylindrical', label: 'Cylindrical' },
]

const EPS = 1e-6
const round = (v: number) => Math.round(v * 1000) / 1000
const snap = (v: number, step = TANK_SNAP) => round(Math.round(v / step) * step)
const clampSide = (v: number) => round(Math.min(TANK_LIMITS.side.max, Math.max(TANK_LIMITS.side.min, v)))

/** A tank centre snapped to the grid. */
export const snapTankCentre = (at: { x: number; z: number }) => ({ x: snap(at.x), z: snap(at.z) })

/** A new tank centred on a point, snapped to the grid. */
export function newTank(at: { x: number; z: number }, shape: TankShape = 'rectangular', size: [number, number] = DEFAULT_TANK_SIZE): FishTank {
  return { id: newId(), shape, position: [snap(at.x), snap(at.z)], size: shape === 'cylindrical' ? [size[0], size[0]] : [...size] }
}

/** Bounding rectangle of the footprint (a cylinder's is its enclosing square). */
export function tankRect(tank: FishTank): Rect {
  const [cx, cz] = tank.position
  const [w, d] = tank.shape === 'cylindrical' ? [tank.size[0], tank.size[0]] : tank.size
  return { x0: round(cx - w / 2), z0: round(cz - d / 2), x1: round(cx + w / 2), z1: round(cz + d / 2) }
}

/** True if the point lies inside the tank's footprint. */
export function tankContains(tank: FishTank, x: number, z: number): boolean {
  if (tank.shape === 'cylindrical') {
    const r = tank.size[0] / 2
    return (x - tank.position[0]) ** 2 + (z - tank.position[1]) ** 2 <= r * r
  }
  const r = tankRect(tank)
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
}

export interface TankSpan {
  /** y of the bottom of the lowest floor and the top of the highest, in metres. */
  bottom: number
  top: number
  /** Floor indexes at each end. */
  lowest: number
  highest: number
}

/** The tank's vertical extent: lowest floor to the top of the highest, from the floors as they are now. */
export function tankSpan(floors: Floor[]): TankSpan | null {
  if (floors.length === 0) return null
  const sorted = [...floors].sort((a, b) => a.index - b.index)
  const low = sorted[0]
  const high = sorted[sorted.length - 1]
  return { bottom: low.elevation, top: high.elevation + high.height, lowest: low.index, highest: high.index }
}

/** Places the tank centred on a point: creates it, or moves the design's one tank there. */
export function placeTank(design: Design, at: { x: number; z: number }, shape: TankShape = 'rectangular'): Design {
  if (!design.tank) return { ...design, tank: newTank(at, shape) }
  return { ...design, tank: { ...design.tank, position: [snap(at.x), snap(at.z)] } }
}

/** The tank moved by a drag offset, snapped so a tank on the grid stays on it. */
export function moveTank(tank: FishTank, from: [number, number], dx: number, dz: number): FishTank {
  return { ...tank, position: [round(from[0] + snap(dx)), round(from[1] + snap(dz))] }
}

/** Width (x) or depth (z), in metres; a cylinder's diameter sets both. Grows from the centre. */
export function resizeTank(tank: FishTank, axis: 'x' | 'z', value: number): FishTank {
  const side = clampSide(value)
  if (tank.shape === 'cylindrical') return { ...tank, size: [side, side] }
  return { ...tank, size: axis === 'x' ? [side, tank.size[1]] : [tank.size[0], side] }
}

/** Changes the shape; a cylinder takes the larger side as its diameter. */
export function setTankShape(tank: FishTank, shape: TankShape): FishTank {
  if (shape === tank.shape) return tank
  const size: [number, number] = shape === 'cylindrical' ? [Math.max(...tank.size), Math.max(...tank.size)] : [tank.size[0], tank.size[0]]
  return { ...tank, shape, size }
}

/** A straight wall in plan: runs along `axis` at `line`, from `from` to `to`. */
export interface WallLineSpan {
  axis: 'x' | 'z'
  line: number
  from: number
  to: number
  thickness: number
}

/**
 * The stretch of a wall that touches the tank, as [from, to] along the wall, or null.
 * A wall touches when its thickness reaches the tank's glass (its centreline on the glass, or
 * its face against it, give or take TANK_CONTACT_GAP). On a rectangular tank the stretch is
 * where the wall runs along the tank's face; on a cylinder it is the chord where the curve stays
 * within CYLINDER_WINDOW_REACH of the wall, so a flat wall gets a window onto the curve.
 * Stretches shorter than TANK_MIN_CONTACT or the wall's thickness (corner squares) don't count.
 */
export function tankContact(tank: FishTank, wall: WallLineSpan): [number, number] | null {
  const reach = wall.thickness / 2 + TANK_CONTACT_GAP
  const [cx, cz] = tank.position
  const [across, along] = wall.axis === 'x' ? [cz, cx] : [cx, cz]
  let span: [number, number] | null = null

  if (tank.shape === 'cylindrical') {
    const r = tank.size[0] / 2
    const d = Math.abs(wall.line - across)
    if (Math.abs(d - r) > reach) return null
    const gap = Math.max(0, d - reach - CYLINDER_WINDOW_REACH)
    const half = Math.sqrt(Math.max(0, r * r - gap * gap))
    span = [along - half, along + half]
  } else {
    const rect = tankRect(tank)
    const [faceA, faceB, a, b] = wall.axis === 'x' ? [rect.z0, rect.z1, rect.x0, rect.x1] : [rect.x0, rect.x1, rect.z0, rect.z1]
    if (Math.abs(wall.line - faceA) > reach && Math.abs(wall.line - faceB) > reach) return null
    span = [a, b]
  }

  const from = Math.max(wall.from, span[0])
  const to = Math.min(wall.to, span[1])
  return to - from > Math.max(TANK_MIN_CONTACT, wall.thickness) + EPS ? [round(from), round(to)] : null
}
