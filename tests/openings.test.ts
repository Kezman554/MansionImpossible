import { describe, expect, it } from 'vitest'
import {
  fitOpening,
  newOpening,
  openingAtPoint,
  openingSpan,
  reattachOpenings,
  restyleOpening,
  wallAtPoint,
  wallOf,
} from '../src/editor/openings'
import { placementFromRect, roomRect, type Rect } from '../src/editor/roomTool'
import { migrateDesign } from '../src/storage/migrateDesign'
import { createDesign } from '../src/store/designStore'
import { openingFills } from '../src/scene/openingFills'
import { layoutWallBoxes, type WallBox } from '../src/scene/roomGeometry'
import type { Opening, Room } from '../src/types/design'

let nextId = 1
function room(rect: Rect, openings: Opening[] = [], { height = 3, thickness = 0.2 } = {}): Room {
  return {
    id: `r${nextId++}`,
    kind: 'room',
    name: 'Room',
    type: 'Room',
    floor: 0,
    ...placementFromRect(rect, height),
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    wallThickness: thickness,
    openings,
    materials: { floor: null, walls: null, ceiling: null },
  }
}
const withOpenings = (r: Room, ...specs: [Opening['style'], Opening['wall'], number][]) => ({ ...r, openings: specs.map(([style, side, along]) => newOpening(style, r, side, along)) })

describe('placing openings', () => {
  const r = room({ x0: 0, z0: 0, x1: 6, z1: 4 })

  it('gives each style its own sizes; glass goes to the ceiling, doors sit on the floor', () => {
    expect(newOpening('single-door', r, 'north', 3)).toMatchObject({ type: 'door', width: 0.9, height: 2.1, sill: 0, offset: 3 })
    expect(newOpening('double-door', r, 'north', 3)).toMatchObject({ type: 'door', width: 1.6 })
    expect(newOpening('window', r, 'east', 2)).toMatchObject({ type: 'window', width: 1.2, height: 1.2, sill: 0.9 })
    expect(newOpening('glass-wall', r, 'south', 3)).toMatchObject({ type: 'window', sill: 0, height: 3 })
  })

  it('snaps position along the wall to 0.1 m and keeps clear of the corners', () => {
    expect(newOpening('single-door', r, 'north', 2.34).offset).toBe(2.3)
    const corner = newOpening('single-door', r, 'north', 0)
    expect(corner.offset - corner.width / 2).toBeCloseTo(0.2) // half the wall thickness + 0.1
  })

  it('fits sizes to the wall: no wider than the wall, no taller than the ceiling, doors without a sill', () => {
    const fitted = fitOpening({ ...newOpening('window', r, 'east', 2), width: 10, sill: 2.5, height: 2 }, r, 4)
    expect(fitted.width).toBeCloseTo(3.6)
    expect(fitted.sill + fitted.height).toBeLessThanOrEqual(3)
    expect(fitOpening({ ...newOpening('single-door', r, 'north', 3), sill: 1 }, r, 6).sill).toBe(0)
  })

  it('restyles with the new style sizes', () => {
    expect(restyleOpening(newOpening('single-door', r, 'north', 3), 'window', r)).toMatchObject({ style: 'window', type: 'window', sill: 0.9 })
  })

  it('finds which wall a point belongs to, and the opening at a point', () => {
    expect(wallAtPoint(r, { x: 2.5, z: 0.05 })).toEqual({ side: 'north', along: 2.5 })
    expect(wallAtPoint(r, { x: 6.08, z: 1 })).toEqual({ side: 'east', along: 1 })
    expect(wallAtPoint(r, { x: 3, z: 2 })).toBeNull()
    const w = withOpenings(r, ['window', 'east', 2])
    expect(openingAtPoint([w], 0, { x: 6, y: 1.5, z: 2.3 })?.opening.style).toBe('window')
    expect(openingAtPoint([w], 0, { x: 6, y: 0.4, z: 2.3 })).toBeNull() // below the sill
  })
})

describe('openings stay attached when a room is resized', () => {
  it('keep their place in the world on walls whose start did not move', () => {
    const before = { x0: 0, z0: 0, x1: 6, z1: 4 }
    const r = withOpenings(room(before), ['single-door', 'north', 2], ['window', 'east', 2])
    const after = { ...before, x1: 9 } // dragged the east edge out
    const [door, window] = reattachOpenings(r, before, after)
    expect(door.offset).toBe(2) // north wall starts at x0, which didn't move
    expect(window.offset).toBe(2) // still on the east wall, which moved with the edge
  })

  it('keep their world position when the wall start moves', () => {
    const before = { x0: 0, z0: 0, x1: 6, z1: 4 }
    const r = withOpenings(room(before), ['single-door', 'north', 4])
    const [door] = reattachOpenings(r, before, { ...before, x0: -2 })
    expect(before.x0 + 4).toBe(-2 + door.offset)
  })

  it('are pushed back inside a wall that got shorter, and shrink if they no longer fit', () => {
    const before = { x0: 0, z0: 0, x1: 8, z1: 4 }
    const r = withOpenings(room(before), ['glass-wall', 'north', 6])
    const shorter = { ...before, x1: 3 }
    const [glass] = reattachOpenings(r, before, shorter)
    expect(glass.offset + glass.width / 2).toBeLessThanOrEqual(3 - 0.2 + 1e-9)
    expect(glass.offset - glass.width / 2).toBeGreaterThanOrEqual(0.2 - 1e-9)
  })
})

/** Volume shared by two boxes (y from bottom to top, plan from the wall line). */
function overlap(a: WallBox, b: WallBox): number {
  const plan = (w: WallBox) => {
    const h = w.thickness / 2
    return w.axis === 'x' ? [w.from, w.to, w.line - h, w.line + h] : [w.line - h, w.line + h, w.from, w.to]
  }
  const [ax0, ax1, az0, az1] = plan(a)
  const [bx0, bx1, bz0, bz1] = plan(b)
  const d = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
  return d(ax0, ax1, bx0, bx1) * d(az0, az1, bz0, bz1) * d(a.bottom, a.top, b.bottom, b.top)
}

/**
 * Whether a point on a wall line is inside a solid box — any box, whichever way it runs, or
 * with sameLine only boxes of that wall itself (in overlapping rooms another room's wall can
 * legitimately cross an opening).
 */
function solidAt(boxes: WallBox[], axis: 'x' | 'z', line: number, along: number, y: number, sameLine = false): boolean {
  const [x, z] = axis === 'x' ? [along, line] : [line, along]
  return boxes.some((b) => {
    if (sameLine && (b.axis !== axis || Math.abs(b.line - line) > 1e-6)) return false
    const h = b.thickness / 2
    const [x0, x1, z0, z1] = b.axis === 'x' ? [b.from, b.to, b.line - h, b.line + h] : [b.line - h, b.line + h, b.from, b.to]
    return x > x0 - 1e-9 && x < x1 + 1e-9 && z > z0 - 1e-9 && z < z1 + 1e-9 && y > b.bottom - 1e-9 && y < b.top + 1e-9
  })
}

/** Wall boxes never overlap; every hole is empty; around the holes the wall is solid; fills sit inside their hole. */
function expectSoundOpenings(rooms: Room[]) {
  const boxes = layoutWallBoxes(rooms)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `boxes ${i}, ${j}`).toBeLessThan(1e-9)
  for (const r of rooms) {
    for (const o of r.openings) {
      const s = openingSpan(r, o)
      const mid = (s.from + s.to) / 2
      // Another opening overlapping this one (allowed: no architectural rules) legitimately opens the wall there too.
      const inAnotherHole = (along: number, y: number) =>
        rooms.some((other) =>
          other.openings.some((p) => {
            const t = openingSpan(other, p)
            return p !== o && t.axis === s.axis && Math.abs(t.line - s.line) < 1e-6 && along > t.from - 1e-9 && along < t.to + 1e-9 && y > t.bottom - 1e-9 && y < t.top + 1e-9
          }),
        )
      const expectSolid = (along: number, y: number, what: string) => {
        if (!inAnotherHole(along, y)) expect(solidAt(boxes, s.axis, s.line, along, y), what).toBe(true)
      }
      expect(solidAt(boxes, s.axis, s.line, mid, (s.bottom + s.top) / 2, true), 'hole is open').toBe(false)
      if (s.bottom > 0.01) expectSolid(mid, s.bottom / 2, 'wall under the sill')
      if (s.top < r.size[1] - 0.01) expectSolid(mid, (s.top + r.size[1]) / 2, 'wall over the head')
      expectSolid(s.from - 0.05, 1, 'wall beside the hole')
      for (const f of openingFills(r, o)) {
        expect(f.from >= s.from - 1e-9 && f.to <= s.to + 1e-9 && f.bottom >= -1e-9 && f.top <= s.top + 1e-9, `${o.style} fill inside its hole`).toBe(true)
      }
    }
  }
  return boxes
}

describe('cutting openings into walls', () => {
  it('cuts each style into a single wall', () => {
    const r = withOpenings(room({ x0: 0, z0: 0, x1: 10, z1: 6 }), ['single-door', 'north', 2], ['double-door', 'north', 6], ['window', 'east', 2], ['glass-wall', 'south', 5], ['window', 'west', 4])
    expectSoundOpenings([r])
  })

  it('cuts a door in a shared wall once, through both rooms', () => {
    const a = withOpenings(room({ x0: 0, z0: 0, x1: 5, z1: 4 }), ['single-door', 'east', 2])
    const b = room({ x0: 5, z0: 0, x1: 10, z1: 4 })
    const boxes = expectSoundOpenings([a, b])
    expect(boxes.filter((x) => x.axis === 'z' && x.line === 5 && x.bottom > 0)).toHaveLength(1) // the lintel over the door
  })

  it('stays sound across random rooms with random openings', () => {
    let seed = 7
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]
    for (let layout = 0; layout < 150; layout++) {
      const rooms = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
        const x0 = Math.round(random() * 24) / 2
        const z0 = Math.round(random() * 24) / 2
        const r = room({ x0, z0, x1: x0 + 3 + Math.round(random() * 10) / 2, z1: z0 + 3 + Math.round(random() * 10) / 2 })
        const rect = roomRect(r)
        const specs = Array.from({ length: Math.floor(random() * 4) }, (): [Opening['style'], Opening['wall'], number] => {
          const side = pick(['north', 'east', 'south', 'west'] as const)
          return [pick(['single-door', 'double-door', 'window', 'glass-wall'] as const), side, random() * wallOf(rect, side).length]
        })
        return withOpenings(r, ...specs)
      })
      expectSoundOpenings(rooms)
    }
  })
})

describe('design migration v2 → v3', () => {
  it('gives existing openings a style from their type', () => {
    const v2 = { ...createDesign('Old'), version: 2, rooms: [{ ...room({ x0: 0, z0: 0, x1: 4, z1: 4 }), openings: [{ id: 'o', type: 'window', wall: 'north', offset: 2, width: 1, height: 1, sill: 1 }] }] }
    expect(migrateDesign(v2).rooms[0].openings[0].style).toBe('window')
  })
})
