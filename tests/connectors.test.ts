import { describe, expect, it } from 'vitest'
import { CONNECTOR_TYPES, CONNECTORS } from '../src/editor/connectors/catalog'
import {
  clipToRect,
  connectorOutline,
  connectorSize,
  connectorSpan,
  defaultConnectorFloors,
  floorHoles,
  holesInRect,
  MAX_RISER,
  newConnector,
  pieceOnFloor,
  polygonArea,
  resizeConnector,
  setConnectorFloors,
} from '../src/editor/connectors/connectors'
import { connectorParts } from '../src/editor/connectors/geometry'
import { pieceLabel } from '../src/editor/freeform/catalog'
import { addFloor, removeFloor, setFloorHeight } from '../src/editor/floors'
import { editorActionFor } from '../src/editor/editorShortcuts'
import { createDesign } from '../src/store/designStore'
import type { Design, Piece } from '../src/types/design'

/** Ground, First and Second floors, 3 m each. */
function threeFloors(): Design {
  let d = createDesign('C')
  d = addFloor(d, 'above').design
  return addFloor(d, 'above').design
}
let n = 0
const make = (d: Design, type: (typeof CONNECTOR_TYPES)[number], at = { x: 0, z: 0 }, active = 0): Piece => ({ ...(newConnector(type, d.floors, active, at, 0.5) as Piece), id: `c${n++}` })

describe('connector catalogue', () => {
  it('has straight and spiral stairs, an elevator, spiral and straight slides and a pole', () => {
    expect(CONNECTOR_TYPES.map((t) => pieceLabel(t))).toEqual(['Straight stairs', 'Spiral stairs', 'Elevator', 'Spiral slide', 'Straight slide', "Fireman's pole"])
    expect(editorActionFor({ key: 'c', ctrlKey: false, metaKey: false, altKey: false, target: null })).toBe('connector-tool')
  })
})

describe('floors and fitting', () => {
  it('joins the active floor to the one above by default (or the one below on the top floor)', () => {
    const d = threeFloors()
    expect(defaultConnectorFloors(d.floors, 0)).toEqual({ floor: 0, toFloor: 1 })
    expect(defaultConnectorFloors(d.floors, 2)).toEqual({ floor: 1, toFloor: 2 })
    expect(defaultConnectorFloors(createDesign('one').floors, 0)).toEqual({ floor: 0, toFloor: 0 })
  })

  it('fits every type to the floors it joins, from ground to second floor', () => {
    const d = threeFloors()
    for (const type of CONNECTOR_TYPES) {
      const c = { ...make(d, type), ...setConnectorFloors(make(d, type), 0, 2, d.floors) }
      const [, h] = connectorSize(c, d.floors)
      expect(h, type).toBe(type === 'elevator' ? 9 : 6)
      expect(pieceOnFloor(c, 1) && pieceOnFloor(c, 2) && pieceOnFloor(c, 0)).toBe(true)
    }
  })

  it('sizes stairs by risers and slides by their slope; round ones by diameter', () => {
    const d = threeFloors()
    const stairs = make(d, 'stairs')
    expect(stairs.size[1]).toBe(3)
    expect(3 / Math.ceil(3 / MAX_RISER)).toBeLessThanOrEqual(MAX_RISER)
    expect(stairs.size[2]).toBeCloseTo(Math.ceil(3 / MAX_RISER) * 0.28)
    const twoFloors = connectorSize({ ...stairs, toFloor: 2 }, d.floors)
    expect(twoFloors[2]).toBeGreaterThan(stairs.size[2] * 1.9)
    const slide = make(d, 'slide')
    expect(slide.size[2]).toBeCloseTo(3 / Math.tan((35 * Math.PI) / 180) + 1.2, 2)
    const spiral = make(d, 'spiral-stairs')
    expect(spiral.size).toEqual([2.2, 3, 2.2])
    expect(resizeConnector(spiral, 'x', 3, d.floors).size).toEqual([3, 3, 3])
    expect(resizeConnector(make(d, 'elevator'), 'z', 2.6, d.floors).size).toEqual([2, 6, 2.6])
  })

  it('setting floors in either order keeps the start the lower one', () => {
    const d = threeFloors()
    expect(setConnectorFloors(make(d, 'fireman-pole'), 2, 0, d.floors)).toMatchObject({ floor: 0, toFloor: 2, size: [1.2, 6, 1.2] })
  })

  it('refits when floor heights change and follows floors being removed', () => {
    let d = threeFloors()
    const c = { ...make(d, 'stairs'), toFloor: 2 }
    d = { ...d, pieces: [c] }
    d = setFloorHeight(d, 1, 4)
    expect(d.pieces[0].size[1]).toBe(7)
    expect(connectorSpan(d.pieces[0], d.floors)).toMatchObject({ bottom: 0, top: 7 })
    d = removeFloor(d, 2)
    expect(d.pieces[0]).toMatchObject({ floor: 0, toFloor: 1 })
    expect(d.pieces[0].size[1]).toBe(3) // ground to the First floor's surface
  })
})

describe('holes', () => {
  it('cuts the floors a connector passes up through, and the ceilings below them', () => {
    const d = threeFloors()
    const c = { ...make(d, 'elevator'), toFloor: 2 }
    const design = { ...d, pieces: [c] }
    expect([0, 1, 2].map((f) => floorHoles(design, f, 'slab').length)).toEqual([0, 1, 1])
    expect([0, 1, 2].map((f) => floorHoles(design, f, 'ceiling').length)).toEqual([1, 1, 0])
  })

  it('outlines follow position and rotation; round ones are circles', () => {
    const d = threeFloors()
    const stairs = { ...make(d, 'stairs', { x: 5, z: 5 }), rotation: [0, Math.PI / 2, 0] as Piece['rotation'] }
    const outline = connectorOutline(stairs, d.floors)
    const xs = outline.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(stairs.size[2]) // turned 90°: the run lies along x
    expect(polygonArea(outline)).toBeCloseTo(stairs.size[0] * stairs.size[2])
    const pole = connectorOutline(make(d, 'fireman-pole', { x: 1, z: 1 }), d.floors)
    expect(polygonArea(pole)).toBeCloseTo(Math.PI * 0.36, 1)
  })

  it('clips holes into the slab and merges overlapping ones', () => {
    const square = (x: number, z: number, s: number): [number, number][] => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]]
    const rect = { x0: 0, z0: 0, x1: 4, z1: 4 }
    expect(polygonArea(clipToRect(square(3, 3, 2), rect))).toBeCloseTo(1)
    expect(clipToRect(square(5, 5, 1), rect)).toEqual([])
    const holes = holesInRect(rect, [square(1, 1, 1), square(1.5, 1.5, 1), square(3, 0.5, 2)])
    expect(holes).toHaveLength(2)
    for (const h of holes) for (const [x, z] of h) expect(x > 0 && x < 4 && z > 0 && z < 4).toBe(true)
  })
})

describe('geometry', () => {
  it('builds every type within its fitted box, reaching the floor above', () => {
    const d = threeFloors()
    for (const type of CONNECTOR_TYPES) {
      const c = make(d, type)
      const parts = connectorParts(type, c.size, CONNECTORS[type].material)
      expect(parts.length, type).toBeGreaterThan(0)
      const top = Math.max(...parts.map((p) => p.geometry.boundingBox!.max.y))
      const bottom = Math.min(...parts.map((p) => p.geometry.boundingBox!.min.y))
      // Sloping stair stringers dip a little into the slab at the foot.
      expect(bottom, type).toBeGreaterThanOrEqual(type === 'stairs' ? -0.15 : -1e-6)
      expect(top, type).toBeGreaterThan(c.size[1] * 0.85)
      expect(top, type).toBeLessThanOrEqual(c.size[1] + 0.61)
      for (const p of parts) {
        const b = p.geometry.boundingBox!
        expect(Math.max(-b.min.x, b.max.x), type).toBeLessThanOrEqual(c.size[0] / 2 + 0.2)
        expect(Math.max(-b.min.z, b.max.z), type).toBeLessThanOrEqual(c.size[2] / 2 + 0.2)
      }
    }
  })
})
