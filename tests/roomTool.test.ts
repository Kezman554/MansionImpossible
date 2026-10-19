import { describe, expect, it } from 'vitest'
import {
  handlePoint,
  moveRect,
  newRoom,
  nextRoomName,
  placementFromRect,
  rectFromDrag,
  resizeRect,
  roomAtPoint,
  roomRect,
  snap,
} from '../src/editor/roomTool'
import type { Room } from '../src/types/design'

const rect = { x0: 0, z0: 0, x1: 4, z1: 3 }

describe('room tool', () => {
  it('snaps to 0.5 m', () => {
    expect([snap(1.24), snap(1.26), snap(-0.74), snap(3)]).toEqual([1, 1.5, -0.5, 3])
  })

  it('draws a snapped rectangle in any drag direction, ignoring rooms under 1 m', () => {
    expect(rectFromDrag({ x: 0.1, z: 0.2 }, { x: 4.2, z: 2.9 })).toEqual({ x0: 0, z0: 0, x1: 4, z1: 3 })
    expect(rectFromDrag({ x: 4.2, z: 2.9 }, { x: 0.1, z: 0.2 })).toEqual({ x0: 0, z0: 0, x1: 4, z1: 3 })
    expect(rectFromDrag({ x: 0, z: 0 }, { x: 0.6, z: 5 })).toBeNull()
  })

  it('round-trips a rectangle through a room position and size', () => {
    const placed = placementFromRect({ x0: -2.5, z0: 1, x1: 3.5, z1: 5.5 }, 3)
    expect(placed).toEqual({ position: [0.5, 0, 3.25], size: [6, 3, 4.5] })
    expect(roomRect(placed)).toEqual({ x0: -2.5, z0: 1, x1: 3.5, z1: 5.5 })
  })

  it('resizes from edges and corners, snapped, never below 1 m', () => {
    expect(resizeRect(rect, 'e', { x: 6.2, z: 99 })).toEqual({ x0: 0, z0: 0, x1: 6, z1: 3 })
    expect(resizeRect(rect, 'nw', { x: -1.1, z: -2.3 })).toEqual({ x0: -1, z0: -2.5, x1: 4, z1: 3 })
    expect(resizeRect(rect, 'w', { x: 10, z: 0 })).toEqual({ x0: 3, z0: 0, x1: 4, z1: 3 })
    expect(resizeRect(rect, 's', { x: 0, z: -5 })).toEqual({ x0: 0, z0: 0, x1: 4, z1: 1 })
  })

  it('moves by snapped steps so grid-aligned edges stay aligned', () => {
    expect(moveRect(rect, 1.3, -0.2)).toEqual({ x0: 1.5, z0: 0, x1: 5.5, z1: 3 })
  })

  it('puts handles on corners and edge midpoints', () => {
    expect(handlePoint(rect, 'nw')).toEqual({ x: 0, z: 0 })
    expect(handlePoint(rect, 's')).toEqual({ x: 2, z: 3 })
    expect(handlePoint(rect, 'e')).toEqual({ x: 4, z: 1.5 })
  })

  it('names new rooms Room 1, Room 2… filling gaps', () => {
    expect(nextRoomName([])).toBe('Room 1')
    expect(nextRoomName([{ name: 'Room 1' }, { name: 'Library' }, { name: 'Room 3' }])).toBe('Room 2')
  })

  it('creates a room with editable wall height and thickness', () => {
    expect(newRoom(rect, 0, [])).toMatchObject({ kind: 'room', name: 'Room 1', type: 'Room', size: [4, 3, 3], wallThickness: 0.2, floor: 0 })
  })

  it('finds the room under a point, preferring the room whose interior holds it', () => {
    const make = (id: string, r: typeof rect) => ({ ...(newRoom(r, 0, []) as Room), id, rotation: [0, 0, 0], scale: [1, 1, 1] }) as Room
    const a = make('a', rect)
    const b = make('b', { x0: 4, z0: 0, x1: 8, z1: 3 })
    expect(roomAtPoint([a, b], 0, 2, 1.5)?.id).toBe('a')
    expect(roomAtPoint([a, b], 0, 6, 1.5)?.id).toBe('b')
    expect(roomAtPoint([a, b], 0, 4.05, 1.5)).toBeDefined() // on the shared wall: either is fine
    expect(roomAtPoint([a, b], 0, 20, 20)).toBeUndefined()
    expect(roomAtPoint([a, b], 1, 2, 1.5)).toBeUndefined()
  })
})
