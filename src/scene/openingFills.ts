// What fills a door or window hole: door leaves, glass and frames, as plain boxes.
import { OPENING_MATERIALS } from '../editor/catalog/materials'
import { openingSpan } from '../editor/openings'
import type { Opening, Room } from '../types/design'
import type { WallBox } from './roomGeometry'

export type FillMaterial = keyof typeof OPENING_MATERIALS

export interface FillBox extends Omit<WallBox, 'roomId'> {
  material: FillMaterial
}

const FRAME = 0.06
const LEAF = 0.05
const GLASS = 0.02
/** Mullions on floor-to-ceiling glass, at most this far apart. */
const MULLION_SPACING = 1.2

export function openingFills(room: Room, opening: Opening): FillBox[] {
  const s = openingSpan(room, opening)
  const base = { axis: s.axis, line: s.line }
  const box = (material: FillMaterial, from: number, to: number, bottom: number, top: number, thickness: number): FillBox => ({ ...base, material, from, to, bottom, top, thickness })
  const depth = Math.min(room.wallThickness, 0.12)
  const out: FillBox[] = []

  if (opening.style === 'bookcase') return bookcaseFills(room, opening)

  if (opening.style === 'single-door' || opening.style === 'double-door') {
    const leaves = opening.style === 'double-door' ? 2 : 1
    const gap = 0.006
    const width = (s.to - s.from - 0.02 - gap * (leaves - 1)) / leaves
    for (let i = 0; i < leaves; i++) {
      const from = s.from + 0.01 + i * (width + gap)
      out.push(box('door', from, from + width, 0.01, s.top - 0.01, LEAF))
    }
    return out
  }

  // Windows and glass walls: a frame round the hole, glass in the middle, mullions on glass walls.
  out.push(box('frame', s.from, s.from + FRAME, s.bottom, s.top, depth))
  out.push(box('frame', s.to - FRAME, s.to, s.bottom, s.top, depth))
  out.push(box('frame', s.from + FRAME, s.to - FRAME, s.top - FRAME, s.top, depth))
  if (s.bottom > 0 || opening.style === 'window') out.push(box('frame', s.from + FRAME, s.to - FRAME, s.bottom, s.bottom + FRAME, depth))
  else out.push(box('frame', s.from + FRAME, s.to - FRAME, 0, FRAME / 2, depth))

  if (opening.style === 'glass-wall') {
    const panes = Math.max(1, Math.ceil((s.to - s.from) / MULLION_SPACING))
    for (let i = 1; i < panes; i++) {
      const at = s.from + ((s.to - s.from) * i) / panes
      out.push(box('frame', at - FRAME / 4, at + FRAME / 4, s.bottom, s.top, depth * 0.8))
    }
  }
  const glassBottom = s.bottom > 0 || opening.style === 'window' ? s.bottom + FRAME : FRAME / 2
  out.push(box('glass', s.from + FRAME, s.to - FRAME, glassBottom, s.top - FRAME, GLASS))
  return out
}

/** Shelves in a bookcase door, and how far apart (about) its shelves are. */
const SHELF_SPACING = 0.42
const CARCASS = 0.04

/**
 * A bookcase secret door, closed: a walnut carcass filling the hole, shelves, and rows of book
 * spines facing into the room that owns the opening; the passage side shows the plain back.
 */
function bookcaseFills(room: Room, opening: Opening): FillBox[] {
  const s = openingSpan(room, opening)
  const depth = Math.min(room.wallThickness, 0.3)
  // Into the owning room: north and west walls face +z / +x, south and east walls -z / -x.
  const inward = opening.wall === 'north' || opening.wall === 'west' ? 1 : -1
  const at = (offset: number) => s.line + inward * offset
  const box = (material: FillMaterial, from: number, to: number, bottom: number, top: number, thickness: number, line = s.line): FillBox => ({ axis: s.axis, line, material, from, to, bottom, top, thickness })
  const out: FillBox[] = [
    box('shelf', s.from, s.from + CARCASS, 0, s.top, depth),
    box('shelf', s.to - CARCASS, s.to, 0, s.top, depth),
    box('shelf', s.from + CARCASS, s.to - CARCASS, s.top - CARCASS, s.top, depth),
    box('shelf', s.from + CARCASS, s.to - CARCASS, 0, 0.08, depth),
    // The back panel, towards the passage side.
    box('shelf', s.from + CARCASS, s.to - CARCASS, 0.08, s.top - CARCASS, 0.02, at(-depth / 2 + 0.01)),
  ]
  const inner = { bottom: 0.08, top: s.top - CARCASS }
  const shelves = Math.max(2, Math.round((inner.top - inner.bottom) / SHELF_SPACING))
  const pitch = (inner.top - inner.bottom) / shelves
  for (let i = 0; i < shelves; i++) {
    const floor = inner.bottom + i * pitch
    if (i > 0) out.push(box('shelf', s.from + CARCASS, s.to - CARCASS, floor - 0.015, floor + 0.015, depth))
    // Books: most of the shelf's height, set back from the room-side edge.
    const bookDepth = depth * 0.7
    out.push(box('books', s.from + CARCASS + 0.01, s.to - CARCASS - 0.01, floor + 0.015, floor + pitch * 0.82, bookDepth, at(depth / 2 - bookDepth / 2 - 0.015)))
  }
  return out
}
