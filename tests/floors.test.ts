import { beforeEach, describe, expect, it } from 'vitest'
import { addFloor, defaultFloorName, nearestFloor, removeFloor, renameFloor, setFloorHeight, stackFloors } from '../src/editor/floors'
import { newOpening } from '../src/editor/openings'
import { newRoom } from '../src/editor/roomTool'
import { createDesign, findObject, useDesignStore } from '../src/store/designStore'
import type { Design, Room } from '../src/types/design'

const store = () => useDesignStore.getState()
const rect = { x0: 0, z0: 0, x1: 6, z1: 4 }

/** Ground + First + Second + Basement, with a room on each and a sofa upstairs. */
function building(): Design {
  let d = createDesign('Tower')
  d = addFloor(d, 'above').design
  d = addFloor(d, 'above').design
  d = addFloor(d, 'below').design
  const room = (floor: number, name: string): Room => ({ ...(newRoom(rect, floor, []) as Room), id: name, name, rotation: [0, 0, 0], scale: [1, 1, 1] })
  return {
    ...d,
    rooms: [room(-1, 'cellar'), room(0, 'hall'), room(1, 'bedroom'), room(2, 'attic')],
    furniture: [{ id: 'sofa', kind: 'furniture', catalogId: 'sofa', material: null, floor: 2, position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  }
}
const summary = (d: Design) => d.floors.map((f) => `${f.index}:${f.name}@${f.elevation}`).join(' ')

describe('floors', () => {
  it('names floors above and below ground', () => {
    expect([defaultFloorName(0), defaultFloorName(1), defaultFloorName(3), defaultFloorName(12), defaultFloorName(-1), defaultFloorName(-2)]).toEqual([
      'Ground floor', 'First floor', 'Third floor', 'Floor 12', 'Basement', 'Basement 2',
    ])
  })

  it('adds any number of floors above and basements below, stacked by height', () => {
    let d = createDesign('x')
    for (let i = 0; i < 4; i++) d = addFloor(d, 'above').design
    for (let i = 0; i < 3; i++) d = addFloor(d, 'below').design
    expect(d.floors.map((f) => f.index)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4])
    expect(d.floors.map((f) => f.elevation)).toEqual([-9, -6, -3, 0, 3, 6, 9, 12])
  })

  it('restacks the floors above (and below, for basements) when a height changes', () => {
    let d = setFloorHeight(building(), 1, 4.5)
    expect(summary(d)).toBe('-1:Basement@-3 0:Ground floor@0 1:First floor@3 2:Second floor@7.5')
    d = setFloorHeight(d, -1, 5)
    expect(d.floors[0].elevation).toBe(-5)
  })

  it('takes full-height rooms with the floor, re-fitting their openings; custom-height rooms keep theirs', () => {
    const d = building()
    const bedroom = d.rooms.find((r) => r.id === 'bedroom')!
    const glass = newOpening('glass-wall', bedroom, 'north', 3)
    const withRooms: Design = {
      ...d,
      rooms: [...d.rooms.map((r) => (r.id === 'bedroom' ? { ...r, openings: [glass] } : r)), { ...bedroom, id: 'low', size: [6, 2.4, 4] as Room['size'], openings: [] }],
    }
    const lower = setFloorHeight(withRooms, 1, 2.6)
    const resized = lower.rooms.find((r) => r.id === 'bedroom')!
    expect(resized.size[1]).toBe(2.6)
    expect(resized.openings[0].height).toBeLessThanOrEqual(2.6)
    expect(lower.rooms.find((r) => r.id === 'low')!.size[1]).toBe(2.4)
  })

  it('clamps floor heights to 2–40 m', () => {
    expect(setFloorHeight(building(), 0, 0.5).floors.find((f) => f.index === 0)!.height).toBe(2)
  })

  it('removes a middle floor and what is on it; the floors above move down', () => {
    const d = removeFloor(building(), 1)
    expect(summary(d)).toBe('-1:Basement@-3 0:Ground floor@0 1:Second floor@3')
    expect(d.rooms.map((r) => `${r.id}@${r.floor}`)).toEqual(['cellar@-1', 'hall@0', 'attic@1'])
    expect(d.furniture[0].floor).toBe(1)
  })

  it('removes a basement; deeper basements move up', () => {
    let d = addFloor(building(), 'below').design
    d = removeFloor(d, -1)
    expect(d.floors.map((f) => `${f.index}:${f.name}`)[0]).toBe('-1:Basement 2')
    expect(d.rooms.some((r) => r.id === 'cellar')).toBe(false)
  })

  it('removes the ground floor; the floor above becomes ground', () => {
    const d = removeFloor(building(), 0)
    expect(summary(d)).toBe('-1:Basement@-3 0:First floor@0 1:Second floor@3')
    expect(d.rooms.find((r) => r.id === 'bedroom')!.floor).toBe(0)
  })

  it('never removes the last floor', () => {
    const d = createDesign('x')
    expect(removeFloor(d, 0)).toBe(d)
  })

  it('renames, ignoring blank names', () => {
    expect(renameFloor(building(), 2, '  Observatory ').floors.find((f) => f.index === 2)!.name).toBe('Observatory')
    const d = building()
    expect(renameFloor(d, 2, '   ')).toBe(d)
  })

  it('finds the nearest remaining floor', () => {
    const floors = stackFloors(building().floors)
    expect([nearestFloor(floors, 1), nearestFloor(floors, 7), nearestFloor(floors, -5)]).toEqual([1, 2, -1])
  })
})

describe('floor changes are undo steps', () => {
  beforeEach(() => store().loadDesign(building()))

  it('removing a floor with things on it is one step, and undo brings it all back', () => {
    const before = store().design
    store().select('attic')
    store().applyDesign(removeFloor(store().design, 2))
    expect(findObject(store().design, 'attic')).toBeUndefined()
    expect(findObject(store().design, 'sofa')).toBeUndefined()
    expect(store().selection).toEqual([])
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(store().design.floors).toEqual(before.floors)
    expect(store().design.rooms).toEqual(before.rooms)
    expect(store().design.furniture).toEqual(before.furniture)
  })

  it('adding, renaming and resizing are each one step', () => {
    store().applyDesign(addFloor(store().design, 'above').design)
    store().applyDesign(renameFloor(store().design, 3, 'Roof terrace'))
    store().applyDesign(setFloorHeight(store().design, 3, 5))
    expect(store().past).toHaveLength(3)
    store().undo()
    expect(store().design.floors.find((f) => f.index === 3)!.height).toBe(3)
    store().undo()
    store().undo()
    expect(store().design.floors).toHaveLength(4)
  })

  it('an unchanged design adds no step', () => {
    store().applyDesign(renameFloor(store().design, 0, '   '))
    expect(store().past).toHaveLength(0)
  })
})
