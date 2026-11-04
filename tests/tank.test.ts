import { beforeEach, describe, expect, it } from 'vitest'
import { addFloor, removeFloor, setFloorHeight } from '../src/editor/floors'
import { newRoom, placementFromRect, type Rect } from '../src/editor/roomTool'
import { moveTank, newTank, placeTank, resizeTank, setTankShape, tankContact, tankContains, tankSpan, TANK_LIMITS } from '../src/editor/tank'
import { layoutFloorWalls, onAquarium } from '../src/scene/roomGeometry'
import { openingSpan } from '../src/editor/openings'
import { migrateDesign } from '../src/storage/migrateDesign'
import { parseDesign, serialiseDesign } from '../src/storage/designFile'
import { createDesign, useDesignStore } from '../src/store/designStore'
import type { Design, FishTank, Room } from '../src/types/design'

let nextId = 1
function room(rect: Rect, floor = 0, thickness = 0.2): Room {
  return {
    ...(newRoom(rect, floor, []) as Omit<Room, 'id' | 'rotation' | 'scale'>),
    id: `r${nextId++}`,
    ...placementFromRect(rect, 3),
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    wallThickness: thickness,
  } as Room
}

/** A 4 × 4 m rectangular tank centred on the origin: faces at x = ±2 and z = ±2. */
const rectTank = (): FishTank => ({ id: 'tank', shape: 'rectangular', position: [0, 0], size: [4, 4] })
const length = (boxes: { from: number; to: number }[]) => boxes.reduce((sum, b) => sum + b.to - b.from, 0)

describe('tank placement and shape', () => {
  it('places one tank, snapped; placing again moves the same tank', () => {
    const placed = placeTank(createDesign('T'), { x: 3.3, z: -1.2 })
    expect(placed.tank).toMatchObject({ shape: 'rectangular', position: [3.5, -1], size: [4, 4] })
    const moved = placeTank(placed, { x: 10.1, z: 0 })
    expect(moved.tank!.id).toBe(placed.tank!.id)
    expect(moved.tank!.position).toEqual([10, 0])
  })

  it('moves by a snapped drag offset and resizes within limits', () => {
    const t = rectTank()
    expect(moveTank(t, [0, 0], 1.3, -2.8).position).toEqual([1.5, -3])
    expect(resizeTank(t, 'x', 7.25).size).toEqual([7.25, 4])
    expect(resizeTank(t, 'z', 0.1).size).toEqual([4, TANK_LIMITS.side.min])
    expect(resizeTank(t, 'x', 999).size[0]).toBe(TANK_LIMITS.side.max)
  })

  it('switches between rectangular and cylindrical; a cylinder keeps one diameter', () => {
    const cyl = setTankShape({ ...rectTank(), size: [3, 6] }, 'cylindrical')
    expect(cyl).toMatchObject({ shape: 'cylindrical', size: [6, 6] })
    expect(resizeTank(cyl, 'z', 5).size).toEqual([5, 5])
    expect(tankContains(cyl, 2.9, 0)).toBe(true)
    expect(tankContains(cyl, 2.5, 2.5)).toBe(false)
    expect(setTankShape(cyl, 'rectangular').size).toEqual([6, 6])
  })
})

describe('tank height follows the floors', () => {
  it('spans the lowest floor to the top of the highest, through adds, removes and height changes', () => {
    let d = createDesign('T')
    expect(tankSpan(d.floors)).toEqual({ bottom: 0, top: 3, lowest: 0, highest: 0 })
    d = addFloor(d, 'above').design
    d = addFloor(d, 'above').design
    d = addFloor(d, 'below').design
    expect(tankSpan(d.floors)).toEqual({ bottom: -3, top: 9, lowest: -1, highest: 2 })
    d = setFloorHeight(d, 1, 5)
    expect(tankSpan(d.floors)!.top).toBe(11)
    d = removeFloor(d, -1)
    expect(tankSpan(d.floors)).toEqual({ bottom: 0, top: 11, lowest: 0, highest: 2 })
  })
})

describe('walls touching the tank', () => {
  it('a wall on the tank face, or with its face against the glass, touches along the tank', () => {
    const t = rectTank()
    expect(tankContact(t, { axis: 'x', line: 2, from: -5, to: 5, thickness: 0.2 })).toEqual([-2, 2])
    expect(tankContact(t, { axis: 'x', line: 2.1, from: -5, to: 5, thickness: 0.2 })).toEqual([-2, 2])
    expect(tankContact(t, { axis: 'z', line: -2, from: 1, to: 6, thickness: 0.2 })).toEqual([1, 2])
  })

  it('walls away from the tank, or only meeting it end-on or at a corner square, do not', () => {
    const t = rectTank()
    expect(tankContact(t, { axis: 'x', line: -2, from: -8.1, to: -1.9, thickness: 0.2 })).toBeNull()
    expect(tankContact(t, { axis: 'x', line: 3, from: -5, to: 5, thickness: 0.2 })).toBeNull()
    expect(tankContact(t, { axis: 'x', line: 2, from: 2, to: 6, thickness: 0.2 })).toBeNull()
    expect(tankContact(t, { axis: 'x', line: 0, from: -5, to: 5, thickness: 0.2 })).toBeNull()
  })

  it('a flat wall tangent to a cylinder gets a window onto the curve', () => {
    const cyl: FishTank = { id: 't', shape: 'cylindrical', position: [0, 0], size: [4, 4] }
    const span = tankContact(cyl, { axis: 'x', line: 2, from: -6, to: 6, thickness: 0.2 })!
    expect(span[0]).toBeCloseTo(-span[1])
    expect(span[1]).toBeGreaterThan(1)
    expect(span[1]).toBeLessThan(2)
    expect(tankContact(cyl, { axis: 'x', line: 3, from: -6, to: 6, thickness: 0.2 })).toBeNull()
  })

  it('replaces only the touching stretch with glass, on every floor with rooms against the tank', () => {
    const t = rectTank()
    // Ground: a room east of the tank sharing its face; first floor: one to the south, wider than the tank.
    const ground = [room({ x0: 2, z0: -3, x1: 7, z1: 3 }, 0)]
    const first = [room({ x0: -4, z0: 2, x1: 4, z1: 6 }, 1)]
    const g = layoutFloorWalls(ground, t)
    expect(g.aquarium).toHaveLength(1)
    expect(g.aquarium[0]).toMatchObject({ axis: 'z', line: 2, from: -2, to: 2, bottom: 0, top: 3 })
    // The rest of that west wall is still solid on either side of the glass.
    const westSolid = g.boxes.filter((b) => b.axis === 'z' && b.line === 2)
    expect(westSolid.length).toBe(2)
    expect(westSolid.every((b) => b.to <= -2 + 1e-9 || b.from >= 2 - 1e-9)).toBe(true)

    const f = layoutFloorWalls(first, t)
    expect(f.aquarium).toHaveLength(1)
    expect(f.aquarium[0]).toMatchObject({ axis: 'x', line: 2, from: -2, to: 2 })
    // Glass plus wall covers the whole original wall length (nothing lost, nothing doubled).
    const without = layoutFloorWalls(first, null)
    expect(length(f.boxes) + length(f.aquarium)).toBeCloseTo(length(without.boxes))
  })

  it('follows when the tank or the rooms move', () => {
    const rooms = [room({ x0: 2, z0: -3, x1: 7, z1: 3 })]
    expect(layoutFloorWalls(rooms, rectTank()).aquarium).toHaveLength(1)
    const tank = moveTank(rectTank(), [0, 0], -3, 0) // faces now at x = -5 and -1
    expect(layoutFloorWalls(rooms, tank).aquarium).toHaveLength(0)
    const followed = [room({ x0: -1, z0: -3, x1: 4, z1: 3 })]
    expect(layoutFloorWalls(followed, tank).aquarium[0]).toMatchObject({ axis: 'z', line: -1, from: -2, to: 2 })
    expect(layoutFloorWalls(rooms, null).aquarium).toHaveLength(0)
  })

  it('a door on the glass stretch is not cut; one elsewhere still is', () => {
    const r = room({ x0: 2, z0: -3, x1: 7, z1: 3 })
    r.openings = [
      { id: 'o1', type: 'door', style: 'single-door', wall: 'west', offset: 3, width: 1, height: 2.1, sill: 0 },
      { id: 'o2', type: 'door', style: 'single-door', wall: 'east', offset: 3, width: 1, height: 2.1, sill: 0 },
    ]
    const { boxes, aquarium } = layoutFloorWalls([r], rectTank())
    expect(onAquarium(openingSpan(r, r.openings[0]), aquarium)).toBe(true)
    expect(onAquarium(openingSpan(r, r.openings[1]), aquarium)).toBe(false)
    expect(boxes.some((b) => b.line === 7 && b.bottom > 0)).toBe(true) // lintel over the east door
    expect(boxes.some((b) => b.line === 2 && b.bottom > 0)).toBe(false)
  })
})

describe('the tank in the design store and files', () => {
  beforeEach(() => useDesignStore.getState().loadDesign(createDesign('T')))

  it('selects, deletes and undoes the tank like any object', () => {
    const store = useDesignStore.getState()
    store.applyDesign(placeTank(store.design, { x: 0, z: 0 }))
    const id = useDesignStore.getState().design.tank!.id
    useDesignStore.getState().select(id)
    expect(useDesignStore.getState().selection).toEqual([id])
    useDesignStore.getState().removeObjects(id)
    expect(useDesignStore.getState().design.tank).toBeNull()
    expect(useDesignStore.getState().selection).toEqual([])
    useDesignStore.getState().undo()
    expect(useDesignStore.getState().design.tank?.id).toBe(id)
  })

  it('round-trips through a file and migrates older designs to no tank', () => {
    const d: Design = { ...createDesign('T'), tank: newTank({ x: 1, z: 2 }, 'cylindrical', [5, 5]) }
    expect(parseDesign(serialiseDesign(d)).tank).toEqual(d.tank)
    const { tank: _, ...v3 } = { ...createDesign('Old'), version: 3 }
    expect(migrateDesign(v3 as never).tank).toBeNull()
    expect(() => parseDesign(serialiseDesign({ ...d, tank: { ...d.tank!, shape: 'hexagonal' } } as never))).toThrow('"tank" is invalid')
  })
})
