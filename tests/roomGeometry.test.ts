import { describe, expect, it } from 'vitest'
import { placementFromRect, type Rect } from '../src/editor/roomTool'
import { layoutWalls, type WallPiece } from '../src/scene/roomGeometry'
import type { Room } from '../src/types/design'

let nextId = 1
function room(rect: Rect, { height = 3, thickness = 0.2 } = {}): Room {
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
    openings: [],
    materials: { floor: null, walls: null, ceiling: null },
  }
}

/** Footprint of a wall piece in plan: [xMin, xMax, zMin, zMax]. */
function box(p: WallPiece): [number, number, number, number] {
  const h = p.thickness / 2
  return p.axis === 'x' ? [p.from, p.to, p.line - h, p.line + h] : [p.line - h, p.line + h, p.from, p.to]
}

function overlapArea(a: WallPiece, b: WallPiece): number {
  const [ax0, ax1, az0, az1] = box(a)
  const [bx0, bx1, bz0, bz1] = box(b)
  return Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)) * Math.max(0, Math.min(az1, bz1) - Math.max(az0, bz0))
}

const covered = (pieces: WallPiece[], x: number, z: number) =>
  pieces.some((p) => {
    const [x0, x1, z0, z1] = box(p)
    return x >= x0 - 1e-9 && x <= x1 + 1e-9 && z >= z0 - 1e-9 && z <= z1 + 1e-9
  })

/** The properties every layout must have: walls never overlap, and every room edge is walled. */
function expectSound(rooms: Room[], pieces = layoutWalls(rooms)) {
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) expect(overlapArea(pieces[i], pieces[j]), `pieces ${i} and ${j} overlap`).toBeLessThan(1e-9)
  for (const r of rooms) {
    const [cx, , cz] = r.position
    const [w, , d] = r.size
    const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]
    for (let t = 0; t <= 1; t += 0.05) {
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      expect(covered(pieces, x, z0) && covered(pieces, x, z1) && covered(pieces, x0, z) && covered(pieces, x1, z), `edge gap near ${x}, ${z}`).toBe(true)
    }
  }
  return pieces
}

describe('wall layout', () => {
  it('walls one room with x walls owning the corners', () => {
    const pieces = expectSound([room({ x0: 0, z0: 0, x1: 4, z1: 3 })])
    expect(pieces).toHaveLength(4)
    const north = pieces.find((p) => p.axis === 'x' && p.line === 0)!
    const west = pieces.find((p) => p.axis === 'z' && p.line === 0)!
    expect([north.from, north.to]).toEqual([-0.1, 4.1])
    expect([west.from, west.to]).toEqual([0.1, 2.9])
  })

  it('draws a wall shared by two side-by-side rooms once, and merges their outer walls', () => {
    const rooms = [room({ x0: 0, z0: 0, x1: 4, z1: 3 }), room({ x0: 4, z0: 0, x1: 8, z1: 3 })]
    const pieces = expectSound(rooms)
    expect(pieces.filter((p) => p.axis === 'z' && p.line === 4)).toHaveLength(1)
    expect(pieces.filter((p) => p.axis === 'x' && p.line === 0)).toHaveLength(1)
    expect(pieces).toHaveLength(5)
  })

  it('handles a room butting into the middle of another (T-junctions)', () => {
    const rooms = [room({ x0: 0, z0: 0, x1: 8, z1: 3 }), room({ x0: 2, z0: 3, x1: 6, z1: 7 })]
    const pieces = expectSound(rooms)
    expect(pieces.filter((p) => p.axis === 'x' && p.line === 3)).toHaveLength(1)
    const side = pieces.find((p) => p.axis === 'z' && p.line === 2)!
    expect(side.from).toBeCloseTo(3.1) // stops at the face of the shared wall
  })

  it('handles a grid of four rooms meeting at a cross', () => {
    expectSound([
      room({ x0: 0, z0: 0, x1: 4, z1: 4 }),
      room({ x0: 4, z0: 0, x1: 8, z1: 4 }),
      room({ x0: 0, z0: 4, x1: 4, z1: 8 }),
      room({ x0: 4, z0: 4, x1: 8, z1: 8 }),
    ])
  })

  it('handles rooms that only partly share a wall, offset from each other', () => {
    expectSound([room({ x0: 0, z0: 0, x1: 5, z1: 4 }), room({ x0: 5, z0: 2, x1: 9, z1: 7.5 }), room({ x0: 1.5, z0: 4, x1: 5, z1: 9 })])
  })

  it('gives a shared stretch the taller and thicker of the two walls', () => {
    const rooms = [room({ x0: 0, z0: 0, x1: 4, z1: 3 }, { height: 3, thickness: 0.2 }), room({ x0: 4, z0: 0, x1: 8, z1: 3 }, { height: 5, thickness: 0.4 })]
    const pieces = expectSound(rooms)
    const shared = pieces.filter((p) => p.axis === 'z' && p.line === 4)
    expect(shared).toHaveLength(1)
    expect(shared[0]).toMatchObject({ height: 5, thickness: 0.4 })
    // The outer x walls change height where the rooms meet, so they split there.
    expect(pieces.filter((p) => p.axis === 'x' && p.line === 0)).toHaveLength(2)
  })

  it('stays sound for hundreds of random layouts of adjoining and overlapping rooms', () => {
    let seed = 42
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
    const grid = (max: number) => Math.round(random() * max * 2) / 2
    for (let layout = 0; layout < 300; layout++) {
      const rooms = Array.from({ length: 2 + Math.floor(random() * 5) }, () => {
        const x0 = grid(16)
        const z0 = grid(16)
        return room(
          { x0, z0, x1: x0 + 1 + grid(8), z1: z0 + 1 + grid(8) },
          { height: [3, 3, 4.5][Math.floor(random() * 3)], thickness: layout < 200 ? 0.2 : [0.1, 0.2, 0.4][Math.floor(random() * 3)] },
        )
      })
      expectSound(rooms)
    }
  })

  it('handles thick and thin walls meeting at corners', () => {
    expectSound([room({ x0: 0, z0: 0, x1: 6, z1: 4 }, { thickness: 0.6 }), room({ x0: 6, z0: 0, x1: 9, z1: 4 }, { thickness: 0.1 })])
  })
})
