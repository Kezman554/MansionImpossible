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
