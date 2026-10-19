import { beforeEach, describe, expect, it } from 'vitest'
import { createDesign, findObject, HISTORY_LIMIT, useDesignStore, type NewObject } from '../src/store/designStore'
import { historyActionFor } from '../src/store/historyShortcuts'

const store = () => useDesignStore.getState()

const room: NewObject = {
  kind: 'room',
  name: 'Library',
  size: [8, 4, 6],
  position: [2, 0, -3],
  openings: [],
  materials: { floor: null, walls: null, ceiling: null },
}
const pole: NewObject = { kind: 'piece', type: 'fireman-pole', size: [0.1, 6, 0.1], material: null, floor: 1 }
const sofa: NewObject = { kind: 'furniture', catalogId: 'sofa-3-seat', material: null }

beforeEach(() => store().loadDesign(createDesign('Test mansion')))

describe('add', () => {
  it('adds each kind to its collection with a unique id', () => {
    const roomId = store().addObject(room)
    const poleId = store().addObject(pole)
    const sofaId = store().addObject(sofa)
    const { design } = store()

    expect(new Set([roomId, poleId, sofaId]).size).toBe(3)
    expect(design.rooms.map((o) => o.id)).toEqual([roomId])
    expect(design.pieces.map((o) => o.id)).toEqual([poleId])
    expect(design.furniture.map((o) => o.id)).toEqual([sofaId])
  })

  it('keeps given transform fields and defaults the rest', () => {
    const roomId = store().addObject(room)
    expect(findObject(store().design, roomId)).toMatchObject({
      floor: 0,
      position: [2, 0, -3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      size: [8, 4, 6],
    })
    const poleId = store().addObject(pole)
    expect(findObject(store().design, poleId)?.floor).toBe(1)
  })

  it('records one undo step and keeps the design serialisable', () => {
    store().addObject(room)
    expect(store().past).toHaveLength(1)
    const { design } = store()
    expect(JSON.parse(JSON.stringify(design))).toEqual(design)
  })
})

describe('update', () => {
  it('merges the patch and leaves other objects untouched', () => {
    const roomId = store().addObject(room)
    const sofaId = store().addObject(sofa)
    const sofaBefore = findObject(store().design, sofaId)

    store().updateObject(roomId, { name: 'Grand library', position: [0, 0, 0] })

    expect(findObject(store().design, roomId)).toMatchObject({ name: 'Grand library', position: [0, 0, 0], size: [8, 4, 6] })
    expect(findObject(store().design, sofaId)).toBe(sofaBefore)
  })

  it('cannot change id or kind', () => {
    const roomId = store().addObject(room)
    store().updateObject(roomId, { id: 'hijack', kind: 'piece' } as never)
    expect(findObject(store().design, roomId)?.kind).toBe('room')
    expect(findObject(store().design, 'hijack')).toBeUndefined()
  })

  it('ignores unknown ids without adding history', () => {
    store().updateObject('missing', { floor: 3 })
    expect(store().past).toHaveLength(0)
  })

  it('bumps updatedAt', async () => {
    const before = store().design.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    store().addObject(sofa)
    expect(store().design.updatedAt > before).toBe(true)
  })
})

describe('remove', () => {
  it('removes objects and drops them from the selection', () => {
    const roomId = store().addObject(room)
    const sofaId = store().addObject(sofa)
    store().select([roomId, sofaId])

    store().removeObjects(roomId)

    expect(findObject(store().design, roomId)).toBeUndefined()
    expect(findObject(store().design, sofaId)).toBeDefined()
    expect(store().selection).toEqual([sofaId])
  })

  it('removes several objects as one undo step', () => {
    const ids = [store().addObject(room), store().addObject(pole), store().addObject(sofa)]
    const steps = store().past.length
    store().removeObjects(ids)
    expect(store().past.length).toBe(steps + 1)
    store().undo()
    expect(ids.every((id) => findObject(store().design, id))).toBe(true)
  })
})

describe('select', () => {
  it('replaces, adds to and clears the selection, ignoring unknown ids', () => {
    const roomId = store().addObject(room)
    const sofaId = store().addObject(sofa)
    store().select(roomId)
    expect(store().selection).toEqual([roomId])
    store().select([sofaId, roomId, 'missing'], { additive: true })
    expect(store().selection).toEqual([roomId, sofaId])
    store().clearSelection()
    expect(store().selection).toEqual([])
  })

  it('is not an undo step', () => {
    store().select(store().addObject(room))
    expect(store().past).toHaveLength(1)
  })
})

describe('undo and redo', () => {
  it('undoes and redoes an add', () => {
    const roomId = store().addObject(room)
    store().undo()
    expect(findObject(store().design, roomId)).toBeUndefined()
    store().redo()
    expect(findObject(store().design, roomId)?.kind).toBe('room')
  })

  it('undoes and redoes an update', () => {
    const roomId = store().addObject(room)
    store().updateObject(roomId, { name: 'Ballroom' })
    store().undo()
    expect(findObject(store().design, roomId)).toMatchObject({ name: 'Library' })
    store().redo()
    expect(findObject(store().design, roomId)).toMatchObject({ name: 'Ballroom' })
  })

  it('undoes a remove and prunes the selection when an add is undone', () => {
    const roomId = store().addObject(room)
    store().select(roomId)
    store().undo()
    expect(store().selection).toEqual([])
    store().redo()
    store().removeObjects(roomId)
    store().undo()
    expect(findObject(store().design, roomId)).toBeDefined()
  })

  it('a new edit after undo clears the redo stack', () => {
    store().addObject(room)
    store().undo()
    expect(store().canRedo()).toBe(true)
    store().addObject(sofa)
    expect(store().canRedo()).toBe(false)
    store().redo()
    expect(store().design.rooms).toHaveLength(0)
  })

  it('does nothing with an empty history', () => {
    const { design } = store()
    store().undo()
    store().redo()
    expect(store().design).toBe(design)
    expect(store().canUndo()).toBe(false)
  })

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store().addObject(sofa)
    expect(store().past).toHaveLength(HISTORY_LIMIT)
    while (store().canUndo()) store().undo()
    expect(store().design.furniture).toHaveLength(20)
  })

  it('collapses a drag into one step with checkpoint and record: false', () => {
    const sofaId = store().addObject(sofa)
    store().checkpoint()
    for (let x = 1; x <= 10; x++) store().updateObject(sofaId, { position: [x, 0, 0] }, { record: false })
    expect(store().past).toHaveLength(2)
    store().undo()
    expect(findObject(store().design, sofaId)?.position).toEqual([0, 0, 0])
  })

  it('loadDesign clears history and selection', () => {
    store().select(store().addObject(room))
    store().loadDesign(createDesign('Other'))
    expect([store().past, store().future, store().selection]).toEqual([[], [], []])
  })
})

describe('keyboard shortcuts', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
    historyActionFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...mods })

  it('maps Ctrl+Z to undo and Ctrl+Y / Ctrl+Shift+Z to redo', () => {
    expect(key('z', { ctrlKey: true })).toBe('undo')
    expect(key('y', { ctrlKey: true })).toBe('redo')
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(key('z', { metaKey: true })).toBe('undo')
  })

  it('ignores plain keys and other combinations', () => {
    expect(key('z')).toBeNull()
    expect(key('z', { ctrlKey: true, altKey: true })).toBeNull()
    expect(key('s', { ctrlKey: true })).toBeNull()
  })
})
