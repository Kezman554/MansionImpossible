// Room tool logic: drawing, resizing and moving axis-aligned rooms on the grid.
// Pure functions over plain data, so the scene components stay thin and this stays testable.
import { DEFAULT_ROOM_TYPE, DEFAULT_WALL_THICKNESS } from '../storage/migrateDesign'
import type { NewObject } from '../store/designStore'
import type { Room } from '../types/design'

/** Grid snap for drawing, resizing and moving, in metres. */
export const ROOM_SNAP = 0.5
/** Smallest room side, in metres. */
export const MIN_ROOM_SIDE = 1
export const DEFAULT_WALL_HEIGHT = 3

export const ROOM_LIMITS = {
  side: { min: MIN_ROOM_SIDE, max: 200 },
  wallHeight: { min: 2, max: 40 },
  wallThickness: { min: 0.05, max: 2 },
} as const

export const ROOM_TYPES = [
  'Room', 'Hall', 'Living room', 'Bedroom', 'Kitchen', 'Dining room', 'Bathroom', 'Library', 'Study',
  'Ballroom', 'Cinema', 'Games room', 'Gym', 'Pool room', 'Brainstorm room', 'Garage', 'Corridor', 'Other',
] as const

/** Footprint on the wall centreline: x0 < x1, z0 < z1, in metres. */
export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const snap = (value: number, step = ROOM_SNAP): number => Math.round(value / step) * step

const round = (v: number) => Math.round(v * 1000) / 1000

/** Rectangle between two drag points, snapped; null if a side is shorter than MIN_ROOM_SIDE. */
export function rectFromDrag(a: { x: number; z: number }, b: { x: number; z: number }, step = ROOM_SNAP): Rect | null {
  const [ax, az, bx, bz] = [snap(a.x, step), snap(a.z, step), snap(b.x, step), snap(b.z, step)]
  const rect = { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) }
  return rect.x1 - rect.x0 >= MIN_ROOM_SIDE && rect.z1 - rect.z0 >= MIN_ROOM_SIDE ? rect : null
}

export function roomRect(room: Pick<Room, 'position' | 'size'>): Rect {
  const [cx, , cz] = room.position
  const [w, , d] = room.size
  return { x0: round(cx - w / 2), z0: round(cz - d / 2), x1: round(cx + w / 2), z1: round(cz + d / 2) }
}

/** The room fields a rectangle sets: centre position and footprint size (wall height kept). */
export function placementFromRect(rect: Rect, wallHeight: number, y = 0): Pick<Room, 'position' | 'size'> {
  return {
    position: [round((rect.x0 + rect.x1) / 2), y, round((rect.z0 + rect.z1) / 2)],
    size: [round(rect.x1 - rect.x0), wallHeight, round(rect.z1 - rect.z0)],
  }
}

/** "Room 1", "Room 2"… the first number not already used on a room called "Room N". */
export function nextRoomName(rooms: Pick<Room, 'name'>[]): string {
  const taken = new Set(rooms.map((r) => r.name))
  let n = 1
  while (taken.has(`Room ${n}`)) n++
  return `Room ${n}`
}

export function newRoom(rect: Rect, floor: number, existing: Pick<Room, 'name'>[]): NewObject {
  return {
    kind: 'room',
    name: nextRoomName(existing),
    type: DEFAULT_ROOM_TYPE,
    floor,
    ...placementFromRect(rect, DEFAULT_WALL_HEIGHT),
    wallThickness: DEFAULT_WALL_THICKNESS,
    openings: [],
    materials: { floor: null, walls: null, ceiling: null },
  }
}

/** Moves the edges a handle controls to the snapped pointer, keeping at least MIN_ROOM_SIDE. */
export function resizeRect(rect: Rect, handle: Handle, point: { x: number; z: number }, step = ROOM_SNAP): Rect {
  const x = snap(point.x, step)
  const z = snap(point.z, step)
  const next = { ...rect }
  if (handle.includes('w')) next.x0 = Math.min(x, rect.x1 - MIN_ROOM_SIDE)
  if (handle.includes('e')) next.x1 = Math.max(x, rect.x0 + MIN_ROOM_SIDE)
  if (handle.includes('n')) next.z0 = Math.min(z, rect.z1 - MIN_ROOM_SIDE)
  if (handle.includes('s')) next.z1 = Math.max(z, rect.z0 + MIN_ROOM_SIDE)
  return next
}

/** Moves a rectangle by a drag offset, snapped so edges that were on the grid stay on it. */
export function moveRect(rect: Rect, dx: number, dz: number, step = ROOM_SNAP): Rect {
  const sx = snap(dx, step)
  const sz = snap(dz, step)
  return { x0: rect.x0 + sx, z0: rect.z0 + sz, x1: rect.x1 + sx, z1: rect.z1 + sz }
}

/** Where each handle sits on the footprint. North is -z, east is +x. */
export function handlePoint(rect: Rect, handle: Handle): { x: number; z: number } {
  const x = handle.includes('w') ? rect.x0 : handle.includes('e') ? rect.x1 : (rect.x0 + rect.x1) / 2
  const z = handle.includes('n') ? rect.z0 : handle.includes('s') ? rect.z1 : (rect.z0 + rect.z1) / 2
  return { x, z }
}

/**
 * The room under a point on a floor: inside its footprint including half the wall.
 * Where walls are shared, the room whose interior holds the point wins, then the smaller room.
 */
export function roomAtPoint(rooms: Room[], floor: number, x: number, z: number): Room | undefined {
  const hits = rooms
    .filter((r) => r.floor === floor)
    .map((room) => {
      const rect = roomRect(room)
      const half = room.wallThickness / 2
      const inside = x > rect.x0 + half && x < rect.x1 - half && z > rect.z0 + half && z < rect.z1 - half
      const near = x >= rect.x0 - half && x <= rect.x1 + half && z >= rect.z0 - half && z <= rect.z1 + half
      return { room, inside, near, area: (rect.x1 - rect.x0) * (rect.z1 - rect.z0) }
    })
    .filter((h) => h.near)
    .sort((a, b) => Number(b.inside) - Number(a.inside) || a.area - b.area)
  return hits[0]?.room
}
