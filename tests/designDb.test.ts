import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createNewDesign,
  deleteDesign,
  duplicateDesign,
  getDesign,
  importDesign,
  listDesigns,
  renameDesign,
  saveDesign,
} from '../src/storage/designDb'
import { createDesign } from '../src/store/designStore'
import type { Design, Room } from '../src/types/design'

const room = (id: string): Room => ({
  id,
  kind: 'room',
  name: 'Hall',
  floor: 0,
  position: [1, 0, 2],
  rotation: [0, Math.PI / 2, 0],
  scale: [1, 1, 1],
  size: [10, 4, 8],
  openings: [{ id: `${id}-door`, type: 'door', wall: 'south', offset: 2, width: 1, height: 2.1, sill: 0 }],
  materials: { floor: 'marble', walls: null, ceiling: null },
})

function mansion(name: string, updatedAt: string): Design {
  return { ...createDesign(name), updatedAt, rooms: [room(`${name}-hall`)] }
}

beforeEach(async () => {
  for (const { id } of await listDesigns()) await deleteDesign(id)
})

describe('designDb', () => {
  it('saves and loads a design intact', async () => {
    const design = mansion('Kestrel Hall', '2026-10-19T10:00:00.000Z')
    await saveDesign(design)
    expect(await getDesign(design.id)).toEqual(design)
  })

  it('lists summaries, most recently edited first', async () => {
    await saveDesign(mansion('Older', '2026-10-01T10:00:00.000Z'))
    await saveDesign({ ...mansion('Newer', '2026-10-19T10:00:00.000Z'), floors: [...createDesign('x').floors, { id: 'f1', index: 1, name: 'First', elevation: 3, height: 3 }] })
    const list = await listDesigns()
    expect(list.map((d) => d.name)).toEqual(['Newer', 'Older'])
    expect(list[0]).toMatchObject({ floorCount: 2, roomCount: 1 })
  })

  it('creates new designs with unused names', async () => {
    const first = await createNewDesign()
    const second = await createNewDesign()
    expect([first.name, second.name]).toEqual(['Untitled mansion', 'Untitled mansion 2'])
    expect(await getDesign(second.id)).toEqual(second)
  })

  it('renames and bumps updatedAt', async () => {
    const design = mansion('Old name', '2026-01-01T00:00:00.000Z')
    await saveDesign(design)
    await renameDesign(design.id, 'Moat House')
    const renamed = await getDesign(design.id)
    expect(renamed?.name).toBe('Moat House')
    expect(renamed!.updatedAt > design.updatedAt).toBe(true)
    expect(renamed?.rooms).toEqual(design.rooms)
  })

  it('duplicates under a new id and name, leaving the original', async () => {
    const design = mansion('Cliffside', '2026-01-01T00:00:00.000Z')
    await saveDesign(design)
    const copy = await duplicateDesign(design.id)
    expect(copy.id).not.toBe(design.id)
    expect(copy.name).toBe('Cliffside copy')
    expect(copy.rooms).toEqual(design.rooms)
    expect(await getDesign(design.id)).toEqual(design)
    expect((await duplicateDesign(design.id)).name).toBe('Cliffside copy 2')
  })

  it('imports under a fresh id so it never overwrites', async () => {
    const design = mansion('Treetop', '2026-01-01T00:00:00.000Z')
    await saveDesign(design)
    const imported = await importDesign(design)
    expect(imported.id).not.toBe(design.id)
    expect(await listDesigns()).toHaveLength(2)
  })

  it('deletes', async () => {
    const design = mansion('Gone', '2026-01-01T00:00:00.000Z')
    await saveDesign(design)
    await deleteDesign(design.id)
    expect(await getDesign(design.id)).toBeUndefined()
  })
})
