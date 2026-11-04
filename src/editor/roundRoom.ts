// Round rooms: a Room with shape 'round' — one curved wall around a circular floor, centred on
// the room's position, its diameter size[0] (kept equal to size[2], so the bounding square is
// the room's rect and moving, floors, selection and delete work as for any room).
//
// The wall is drawn as ROUND_SEGMENTS flat segments (low poly). Segments that touch the fish
// tank become aquarium glass; screen panels stand just inside the wall, evenly spaced.
// Pure functions over plain data.
import type { FishTank, Room, RoomScreens } from '../types/design'
import { placementFromRect, type Rect } from './roomTool'
import { CYLINDER_WINDOW_REACH, TANK_CONTACT_GAP, tankRect } from './tank'

export const ROUND_SEGMENTS = 48
export const ROUND_LIMITS = { radius: { min: 1, max: 30 } } as const
/** Screens are at least this wide (metres); fewer fit a small room. */
export const SCREEN_MIN_WIDTH = 0.5
export const SCREEN_LIMIT = 24
/** Share of each screen's slice of the wall the screen covers (the rest is the gap between). */
const SCREEN_FILL = 0.88

const round = (v: number) => Math.round(v * 1000) / 1000

export const isRound = (room: Pick<Room, 'shape'>) => room.shape === 'round'

export interface Circle {
  cx: number
  cz: number
  /** Radius of the wall centreline. */
  r: number
}

export const roomCircle = (room: Pick<Room, 'position' | 'size'>): Circle => ({ cx: room.position[0], cz: room.position[2], r: room.size[0] / 2 })

/** True if (x, z) is inside the round room's floor (inside the wall's inner face, with `slack`). */
export function insideRound(room: Pick<Room, 'position' | 'size' | 'wallThickness'>, x: number, z: number, slack = 0): boolean {
  const c = roomCircle(room)
  return Math.hypot(x - c.cx, z - c.cz) <= c.r - room.wallThickness / 2 + slack
}

/** A round room drawn as a rectangle: the circle that fits its larger side, centred on it. */
export function roundFromRect(rect: Rect, wallHeight: number, y = 0): Pick<Room, 'position' | 'size'> {
  const d = Math.max(rect.x1 - rect.x0, rect.z1 - rect.z0)
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  return placementFromRect({ x0: cx - d / 2, z0: cz - d / 2, x1: cx + d / 2, z1: cz + d / 2 }, wallHeight, y)
}

/** Sets the radius (clamped), keeping the centre. */
export function resizeRound(room: Room, radius: number): Pick<Room, 'size'> {
  const r = Math.min(ROUND_LIMITS.radius.max, Math.max(ROUND_LIMITS.radius.min, round(radius)))
  return { size: [r * 2, room.size[1], r * 2] }
}

/**
 * The fields that change when a room switches shape. To round: the circle fits the larger side
 * and openings go (round walls take none yet); screens start at none. To rectangular: a square
 * of the diameter, screens go. One undo step with the caller's update.
 */
export function reshapeRoom(room: Room, shape: Room['shape']): Partial<Room> {
  if (shape === (room.shape ?? 'rectangular')) return {}
  const d = Math.max(room.size[0], room.size[2])
  if (shape === 'round') return { shape, size: [d, room.size[1], d], openings: [], screens: { count: 0, images: [] } }
  return { shape, size: [d, room.size[1], d], screens: undefined }
}

/** Angle of segment i's start, measured from +x towards +z. */
const angleOf = (i: number, n = ROUND_SEGMENTS) => (i / n) * Math.PI * 2

/** Distance from a point to the tank's glass (outside or inside it). */
function distanceToTank(tank: FishTank, x: number, z: number): number {
  if (tank.shape === 'cylindrical') return Math.abs(Math.hypot(x - tank.position[0], z - tank.position[1]) - tank.size[0] / 2)
  const r = tankRect(tank)
  const dx = Math.max(r.x0 - x, 0, x - r.x1)
  const dz = Math.max(r.z0 - z, 0, z - r.z1)
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz)
  return Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z)
}

/**
 * Which wall segments touch the tank (true = aquarium glass): those whose middle, on the wall
 * centreline, is within half the wall's thickness plus the contact gap of the glass — and, as for
 * flat walls on a cylinder, a little further round the curve so the window reads.
 */
export function roundTankContact(room: Pick<Room, 'position' | 'size' | 'wallThickness'>, tank: FishTank | null): boolean[] {
  if (!tank) return new Array<boolean>(ROUND_SEGMENTS).fill(false)
  const c = roomCircle(room)
  const reach = room.wallThickness / 2 + TANK_CONTACT_GAP
  const touching = Array.from({ length: ROUND_SEGMENTS }, (_, i) => {
    const a = (angleOf(i) + angleOf(i + 1)) / 2
    return distanceToTank(tank, c.cx + Math.cos(a) * c.r, c.cz + Math.sin(a) * c.r) <= reach
  })
  if (!touching.some(Boolean)) return touching
  // Widen each touching run by the window reach along the wall, so a tangent gives a window.
  const extra = Math.max(0, Math.round(CYLINDER_WINDOW_REACH / ((2 * Math.PI * c.r) / ROUND_SEGMENTS)))
  return touching.map((_, i) => {
    for (let k = -extra; k <= extra; k++) if (touching[(i + k + ROUND_SEGMENTS) % ROUND_SEGMENTS]) return true
    return false
  })
}

export interface ScreenPanel {
  index: number
  /** Centre of the panel's face (world x, z), and the angle it faces from (towards the centre). */
  x: number
  z: number
  angle: number
  width: number
}

/** Most screens that fit the room at SCREEN_MIN_WIDTH each. */
export function maxScreens(room: Pick<Room, 'position' | 'size' | 'wallThickness'>): number {
  const inner = roomCircle(room).r - room.wallThickness / 2
  return Math.max(0, Math.min(SCREEN_LIMIT, Math.floor((2 * Math.PI * inner * SCREEN_FILL) / SCREEN_MIN_WIDTH)))
}

/** The screen panels: flat, floor to ceiling, evenly spaced just inside the wall. */
export function screenPanels(room: Room): ScreenPanel[] {
  const count = Math.min(room.screens?.count ?? 0, maxScreens(room))
  const c = roomCircle(room)
  const inner = c.r - room.wallThickness / 2 - 0.04
  const slice = (Math.PI * 2) / Math.max(1, count)
  const width = 2 * inner * Math.sin((slice * SCREEN_FILL) / 2)
  // A flat panel's middle sits on the chord, inside the curve.
  const centre = inner * Math.cos((slice * SCREEN_FILL) / 2)
  return Array.from({ length: count }, (_, index) => {
    const angle = (index + 0.5) * slice
    return { index, x: round(c.cx + Math.cos(angle) * centre), z: round(c.cz + Math.sin(angle) * centre), angle, width: round(width) }
  })
}

/** Screens with `count` panels: images kept for screens that remain, blanks for new ones. */
export function setScreenCount(room: Room, count: number): Pick<Room, 'screens'> {
  const n = Math.max(0, Math.min(maxScreens(room), Math.round(count)))
  const images = room.screens?.images ?? []
  return { screens: { count: n, images: Array.from({ length: n }, (_, i) => images[i] ?? null) } }
}

/** Puts an image (by library id; null = blank) on one screen. */
export function setScreenImage(room: Room, index: number, imageId: string | null): Pick<Room, 'screens'> {
  const screens: RoomScreens = room.screens ?? { count: 0, images: [] }
  const images = Array.from({ length: screens.count }, (_, i) => (i === index ? imageId : (screens.images[i] ?? null)))
  return { screens: { count: screens.count, images } }
}

/** The ring's corner points for segment i at radius r: [start, end] as world [x, z]. */
export function segmentEnds(c: Circle, i: number, r: number): [[number, number], [number, number]] {
  const [a0, a1] = [angleOf(i), angleOf(i + 1)]
  return [
    [c.cx + Math.cos(a0) * r, c.cz + Math.sin(a0) * r],
    [c.cx + Math.cos(a1) * r, c.cz + Math.sin(a1) * r],
  ]
}

/** The floor outline of a round room (the wall centreline) as a polygon, counter-clockwise from above. */
export function roundOutline(room: Pick<Room, 'position' | 'size'>, radius = roomCircle(room).r): [number, number][] {
  const c = roomCircle(room)
  return Array.from({ length: ROUND_SEGMENTS }, (_, i) => [c.cx + Math.cos(-angleOf(i)) * radius, c.cz + Math.sin(-angleOf(i)) * radius] as [number, number])
}
