// Floors: any number above ground and below (basements). Pure functions that return a new
// design, so each change is one undo step (useDesignStore.applyDesign).
//
// Floor indexes stay contiguous with the ground floor at 0: 1, 2… above, -1, -2… below.
// Elevations are derived from heights: each floor sits on the one below it, basements
// stack downwards from ground level.
import { newId } from '../store/designStore'
import type { Design, Floor } from '../types/design'
import { refitOpenings } from './openings'

export const DEFAULT_FLOOR_HEIGHT = 3
export const FLOOR_HEIGHT_LIMITS = { min: 2, max: 40 } as const

const ORDINALS = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']

/** "Ground floor", "First floor"… "Floor 11"; "Basement", "Basement 2"… */
export function defaultFloorName(index: number): string {
  if (index < 0) return index === -1 ? 'Basement' : `Basement ${-index}`
  return index < ORDINALS.length ? `${ORDINALS[index]} floor` : `Floor ${index}`
}

export const sortFloors = (floors: Floor[]) => [...floors].sort((a, b) => a.index - b.index)

/** Recomputes every elevation from the heights: ground at 0, upwards and downwards from there. */
export function stackFloors(floors: Floor[]): Floor[] {
  const sorted = sortFloors(floors)
  const byIndex = new Map(sorted.map((f) => [f.index, { ...f }]))
  const ground = byIndex.get(0)
  if (ground) ground.elevation = 0
  for (let i = 1; byIndex.has(i); i++) byIndex.get(i)!.elevation = byIndex.get(i - 1)!.elevation + byIndex.get(i - 1)!.height
  for (let i = -1; byIndex.has(i); i--) byIndex.get(i)!.elevation = byIndex.get(i + 1)!.elevation - byIndex.get(i)!.height
  return sortFloors([...byIndex.values()])
}

/** Adds a floor on top of the highest one, or a basement under the lowest. Returns the new floor's index. */
export function addFloor(design: Design, where: 'above' | 'below'): { design: Design; index: number } {
  const indexes = design.floors.map((f) => f.index)
  const index = where === 'above' ? Math.max(...indexes) + 1 : Math.min(...indexes) - 1
  const floor: Floor = { id: newId(), index, name: defaultFloorName(index), elevation: 0, height: DEFAULT_FLOOR_HEIGHT }
  return { design: { ...design, floors: stackFloors([...design.floors, floor]) }, index }
}

/** Counts what a floor holds, for the remove toast. */
export function floorContents(design: Design, index: number): number {
  return [...design.rooms, ...design.pieces, ...design.furniture].filter((o) => o.floor === index).length
}

/**
 * Removes a floor and everything on it. The floors beyond it close the gap (floors above
 * an upper floor move down, basements below a basement move up), and if the ground floor
 * itself goes, the next floor up — or failing that the top basement — becomes ground.
 * The last remaining floor can't be removed.
 */
export function removeFloor(design: Design, index: number): Design {
  if (design.floors.length <= 1 || !design.floors.some((f) => f.index === index)) return design
  const remaining = design.floors.filter((f) => f.index !== index)
  const hasAbove = remaining.some((f) => f.index > 0)
  const shift = (i: number): number => {
    if (index > 0) return i > index ? i - 1 : i
    if (index < 0) return i < index ? i + 1 : i
    return hasAbove ? (i > 0 ? i - 1 : i) : i < 0 ? i + 1 : i
  }
  const keep = <T extends { floor: number }>(objects: T[]) => objects.filter((o) => o.floor !== index).map((o) => (shift(o.floor) === o.floor ? o : { ...o, floor: shift(o.floor) }))
  return {
    ...design,
    floors: stackFloors(remaining.map((f) => ({ ...f, index: shift(f.index) }))),
    rooms: keep(design.rooms),
    pieces: keep(design.pieces),
    furniture: keep(design.furniture),
  }
}

export function renameFloor(design: Design, index: number, name: string): Design {
  const trimmed = name.trim()
  if (!trimmed) return design
  return { ...design, floors: design.floors.map((f) => (f.index === index ? { ...f, name: trimmed } : f)) }
}

/**
 * Changes a floor's height and restacks the floors above (or below, for basements).
 * Rooms whose walls were the full floor height follow it; their openings are re-fitted.
 */
export function setFloorHeight(design: Design, index: number, height: number): Design {
  const floor = design.floors.find((f) => f.index === index)
  const next = Math.min(FLOOR_HEIGHT_LIMITS.max, Math.max(FLOOR_HEIGHT_LIMITS.min, Math.round(height * 100) / 100))
  if (!floor || next === floor.height) return design
  const rooms = design.rooms.map((room) => {
    if (room.floor !== index || room.size[1] !== floor.height) return room
    const resized = { ...room, size: [room.size[0], next, room.size[2]] as typeof room.size }
    return { ...resized, openings: refitOpenings(resized) }
  })
  return { ...design, rooms, floors: stackFloors(design.floors.map((f) => (f.index === index ? { ...f, height: next } : f))) }
}

/** The floor to show after floors change: the same index if it still exists, else the nearest one. */
export function nearestFloor(floors: Floor[], index: number): number {
  if (floors.some((f) => f.index === index)) return index
  return sortFloors(floors).reduce((best, f) => (Math.abs(f.index - index) < Math.abs(best - index) ? f.index : best), 0)
}
