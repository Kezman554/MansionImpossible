import { beforeEach, describe, expect, it } from 'vitest'
import { deleteSelection } from '../src/editor/deleteSelection'
import { editorActionFor } from '../src/editor/editorShortcuts'
import { newRoom } from '../src/editor/roomTool'
import { parseDesign, serialiseDesign } from '../src/storage/designFile'
import { migrateDesign } from '../src/storage/migrateDesign'
import { useAppStore } from '../src/store/appStore'
import { createDesign, findObject, useDesignStore } from '../src/store/designStore'
import { DESIGN_SCHEMA_VERSION, type Room } from '../src/types/design'

const store = () => useDesignStore.getState()

beforeEach(() => {
  store().loadDesign(createDesign('Test'))
  useAppStore.setState({ toast: null })
})

describe('deleting a room', () => {
  it('deletes without asking and offers Undo in a toast', () => {
    const id = store().addObject(newRoom({ x0: 0, z0: 0, x1: 4, z1: 3 }, 0, []))
    store().updateObject(id, { name: 'Library' })
    store().select(id)
    deleteSelection()

    expect(findObject(store().design, id)).toBeUndefined()
    const toast = useAppStore.getState().toast
    expect(toast?.message).toBe('Library deleted')
    expect(toast?.action?.label).toBe('Undo')

    toast!.action!.run()
    expect((findObject(store().design, id) as Room).name).toBe('Library')
  })

  it("keeps the Undo toast when an autosave's Saved toast arrives", () => {
    store().select(store().addObject(newRoom({ x0: 0, z0: 0, x1: 4, z1: 3 }, 0, [])))
    deleteSelection()
    useAppStore.getState().showToast('Saved', 'saved')
    expect(useAppStore.getState().toast?.action?.label).toBe('Undo')
  })
})

describe('editor shortcuts', () => {
  const key = (k: string, mods = {}) => editorActionFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...mods })

  it('maps V, R, Escape and Delete/Backspace', () => {
    expect([key('v'), key('R'), key('Escape'), key('Delete'), key('Backspace')]).toEqual(['select-tool', 'room-tool', 'escape', 'delete', 'delete'])
  })

  it('leaves modified keys alone (Ctrl+R reloads, Ctrl+V pastes)', () => {
    expect(key('r', { ctrlKey: true })).toBeNull()
    expect(key('v', { metaKey: true })).toBeNull()
  })
})

describe('design migration v1 → v2', () => {
  const v1Room = { id: 'r', kind: 'room', name: 'Hall', floor: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [6, 3, 4], openings: [], materials: { floor: null, walls: null, ceiling: null } }

  it('gives old rooms a wall thickness and type', () => {
    const migrated = migrateDesign({ ...createDesign('Old'), version: 1, rooms: [v1Room] })
    expect(migrated.version).toBe(DESIGN_SCHEMA_VERSION)
    expect(migrated.rooms[0]).toMatchObject({ name: 'Hall', wallThickness: 0.2, type: 'Room' })
  })

  it('imports a v1 backup file', () => {
    const file = serialiseDesign({ ...createDesign('Old'), version: 1, rooms: [v1Room] } as never)
    expect(parseDesign(file).rooms[0].wallThickness).toBe(0.2)
  })

  it('rejects files from a newer app', () => {
    expect(() => parseDesign(serialiseDesign({ ...createDesign('New'), version: DESIGN_SCHEMA_VERSION + 1 } as never))).toThrow("isn't supported")
  })
})
