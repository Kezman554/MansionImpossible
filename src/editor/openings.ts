// Doors and windows: where they sit on a room's walls, how they fit, and how they follow
// the wall when the room is resized. Pure functions over plain data.
import { newId } from '../store/designStore'
import type { Opening, OpeningStyle, Room, WallSide } from '../types/design'
import { roomRect, type Rect } from './roomTool'

export interface OpeningStyleSpec {
  label: string
  type: Opening['type']
  width: number
  /** null = up to the ceiling (floor-to-ceiling glass). */
  height: number | null
  sill: number
}

export const OPENING_STYLES: Record<OpeningStyle, OpeningStyleSpec> = {
  'single-door': { label: 'Single door', type: 'door', width: 0.9, height: 2.1, sill: 0 },
  'double-door': { label: 'Double door', type: 'door', width: 1.6, height: 2.1, sill: 0 },
  window: { label: 'Window', type: 'window', width: 1.2, height: 1.2, sill: 0.9 },
  'glass-wall': { label: 'Floor-to-ceiling glass', type: 'window', width: 2.4, height: null, sill: 0 },
}

/** Position snap along a wall, in metres. */
export const OPENING_SNAP = 0.1
export const OPENING_MIN = { width: 0.3, height: 0.3 }

export const WALL_SIDES: WallSide[] = ['north', 'east', 'south', 'west']

/** A wall of a room as a line: runs along `axis` at `line`, from `start` for `length` metres. */
export interface WallLine {
  axis: 'x' | 'z'
  line: number
  start: number
  length: number
}

export function wallOf(rect: Rect, side: WallSide): WallLine {
  switch (side) {
    case 'north':
      return { axis: 'x', line: rect.z0, start: rect.x0, length: rect.x1 - rect.x0 }
    case 'south':
      return { axis: 'x', line: rect.z1, start: rect.x0, length: rect.x1 - rect.x0 }
    case 'west':
      return { axis: 'z', line: rect.x0, start: rect.z0, length: rect.z1 - rect.z0 }
    case 'east':
      return { axis: 'z', line: rect.x1, start: rect.z0, length: rect.z1 - rect.z0 }
  }
}

/** Keeps openings clear of the corners, where the walls meet. */
const cornerMargin = (room: Pick<Room, 'wallThickness'>) => room.wallThickness / 2 + 0.1
const round = (v: number) => Math.round(v * 1000) / 1000
const snapTo = (v: number, step: number) => Math.round(v / step) * step

/** Makes an opening fit its wall: inside the corners, under the ceiling, doors on the floor. */
export function fitOpening(opening: Opening, room: Pick<Room, 'wallThickness' | 'size'>, wallLength: number): Opening {
  const margin = cornerMargin(room)
  const wallHeight = room.size[1]
  const maxWidth = Math.max(OPENING_MIN.width, wallLength - 2 * margin)
  const width = Math.min(Math.max(opening.width, OPENING_MIN.width), maxWidth)
  const offset = Math.min(Math.max(opening.offset, margin + width / 2), Math.max(margin + width / 2, wallLength - margin - width / 2))
  const sill = opening.type === 'door' ? 0 : Math.min(Math.max(opening.sill, 0), wallHeight - OPENING_MIN.height)
  const height = Math.min(Math.max(opening.height, OPENING_MIN.height), wallHeight - sill)
  return { ...opening, width: round(width), offset: round(offset), sill: round(sill), height: round(height) }
}

export function newOpening(style: OpeningStyle, room: Room, side: WallSide, offset: number): Opening {
  const spec = OPENING_STYLES[style]
  const opening: Opening = {
    id: newId(),
    type: spec.type,
    style,
    wall: side,
    offset: snapTo(offset, OPENING_SNAP),
    width: spec.width,
    height: spec.height ?? room.size[1] - spec.sill,
    sill: spec.sill,
  }
  return fitOpening(opening, room, wallOf(roomRect(room), side).length)
}

/** Changes an opening's style, taking that style's sizes (glass goes up to the ceiling). */
export function restyleOpening(opening: Opening, style: OpeningStyle, room: Room): Opening {
  const spec = OPENING_STYLES[style]
  const next = { ...opening, style, type: spec.type, width: spec.width, height: spec.height ?? room.size[1] - spec.sill, sill: spec.sill }
  return fitOpening(next, room, wallOf(roomRect(room), opening.wall).length)
}

/**
 * Keeps openings where they were in the world when a room is resized, as far as their
 * wall still allows: an opening stays on its wall (attached), keeps its position along it,
 * and is pushed back inside the corners if the wall got shorter.
 */
export function reattachOpenings(room: Room, before: Rect, after: Rect): Opening[] {
  const resized: Room = { ...room, size: [after.x1 - after.x0, room.size[1], after.z1 - after.z0] }
  return room.openings.map((o) => {
    const was = wallOf(before, o.wall)
    const now = wallOf(after, o.wall)
    return fitOpening({ ...o, offset: was.start + o.offset - now.start }, resized, now.length)
  })
}

/** Re-fits every opening, e.g. after the wall height or thickness changed. */
export function refitOpenings(room: Room): Opening[] {
  const rect = roomRect(room)
  return room.openings.map((o) => fitOpening(o, room, wallOf(rect, o.wall).length))
}

/** An opening's hole in world space (y relative to the floor). */
export interface OpeningSpan {
  axis: 'x' | 'z'
  line: number
  from: number
  to: number
  bottom: number
  top: number
}

export function openingSpan(room: Room, opening: Opening): OpeningSpan {
  const wall = wallOf(roomRect(room), opening.wall)
  const centre = wall.start + opening.offset
  return {
    axis: wall.axis,
    line: wall.line,
    from: centre - opening.width / 2,
    to: centre + opening.width / 2,
    bottom: opening.sill,
    top: Math.min(opening.sill + opening.height, room.size[1]),
  }
}

/** Distance along a wall for a world point (x, z). */
export const alongWall = (wall: WallLine, p: { x: number; z: number }) => (wall.axis === 'x' ? p.x : p.z) - wall.start

/**
 * Which of a room's walls a point on (or in) a wall belongs to: the nearest wall whose
 * span holds the point, with the distance along that wall.
 */
export function wallAtPoint(room: Room, p: { x: number; z: number }): { side: WallSide; along: number } | null {
  const rect = roomRect(room)
  const reach = room.wallThickness / 2 + 0.05
  let best: { side: WallSide; along: number; distance: number } | null = null
  for (const side of WALL_SIDES) {
    const wall = wallOf(rect, side)
    const along = alongWall(wall, p)
    if (along < -reach || along > wall.length + reach) continue
    const distance = Math.abs((wall.axis === 'x' ? p.z : p.x) - wall.line)
    if (distance <= reach && (!best || distance < best.distance)) best = { side, along, distance }
  }
  return best && { side: best.side, along: best.along }
}

/** The opening at a point on a floor (x, height above floor, z), if any. */
export function openingAtPoint(rooms: Room[], floor: number, p: { x: number; y: number; z: number }): { room: Room; opening: Opening } | null {
  for (const room of rooms) {
    if (room.floor !== floor) continue
    const reach = room.wallThickness / 2 + 0.05
    for (const opening of room.openings) {
      const s = openingSpan(room, opening)
      const along = s.axis === 'x' ? p.x : p.z
      const across = s.axis === 'x' ? p.z : p.x
      if (along >= s.from - 0.05 && along <= s.to + 0.05 && Math.abs(across - s.line) <= reach && p.y >= s.bottom - 0.05 && p.y <= s.top + 0.05) {
        return { room, opening }
      }
    }
  }
  return null
}
