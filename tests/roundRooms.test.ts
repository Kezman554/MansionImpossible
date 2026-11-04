import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { holesInConvex, polygonArea } from '../src/editor/connectors/connectors'
import { setFloorHeight } from '../src/editor/floors'
import { isBookcase, newOpening, restyleOpening, wallAtPoint } from '../src/editor/openings'
import { paintDesign } from '../src/editor/paint'
import { maxScreens, reshapeRoom, resizeRound, roundOutline, roundTankContact, screenPanels, setScreenCount, setScreenImage } from '../src/editor/roundRoom'
import { newRoom, newRoundRoom, roomAtPoint, type Rect } from '../src/editor/roomTool'
import { openingFills } from '../src/scene/openingFills'
import { buildWallFaces, wallFaceAt } from '../src/scene/wallFaces'
import { db } from '../src/storage/designDb'
import { parseDesign, parseDesignFile, serialiseDesign } from '../src/storage/designFile'
import { embeddedImagesFor, fitWithin, getImage, imageId, imageIdsIn, putImage, storeEmbeddedImages } from '../src/storage/imageStore'
import { createDesign } from '../src/store/designStore'
import { DESIGN_SCHEMA_VERSION, type Design, type FishTank, type Room } from '../src/types/design'

let n = 0
const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 })
const roomFrom = (o: unknown): Room => ({ ...(o as Room), id: `r${n++}`, rotation: [0, 0, 0], scale: [1, 1, 1] })
/** Round room of radius 3 centred at the origin. */
const roundRoom = () => roomFrom(newRoundRoom(rect(-3, -3, 3, 3), 0, []))
const area = (g: ReturnType<typeof buildWallFaces>, key: string) => {
  const geo = g.find((x) => x.key === key)?.geometry
  if (!geo) return 0
  const p = geo.getAttribute('position')
  let sum = 0
  for (let i = 0; i < p.count; i += 3) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2].flatMap((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
    const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az]
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return sum
}

describe('bookcase secret door', () => {
  const room = roomFrom(newRoom(rect(0, 0, 6, 4), 0, []))

  it('is a door style that stores its hinge side and open state', () => {
    const o = newOpening('bookcase', room, 'north', 3)
    expect(o).toMatchObject({ type: 'door', style: 'bookcase', sill: 0, hinge: 'left', open: false, width: 1.2 })
    expect(isBookcase(o)).toBe(true)
    expect(restyleOpening({ ...o, hinge: 'right', open: true }, 'bookcase', room)).toMatchObject({ hinge: 'right', open: true })
    expect(restyleOpening(o, 'single-door', room)).not.toHaveProperty('hinge')
  })

  it('fills its hole: books face into the owning room, the back faces the passage', () => {
    const o = newOpening('bookcase', room, 'north', 3) // north wall at z = 0: the room is on +z
    const fills = openingFills(room, o)
    const books = fills.filter((f) => f.material === 'books')
    expect(books.length).toBeGreaterThanOrEqual(3)
    expect(books.every((b) => b.line > 0)).toBe(true)
    const back = fills.find((f) => f.material === 'shelf' && f.thickness === 0.02)!
    expect(back.line).toBeLessThan(0)
    expect(Math.max(...fills.map((f) => f.top))).toBeCloseTo(o.height)
  })
})

describe('round rooms', () => {
  it('are rooms with a shape: drawn from a rectangle as the circle fitting its larger side', () => {
    const r = roomFrom(newRoundRoom(rect(0, 0, 6, 4), 1, [], 3.5))
    expect(r).toMatchObject({ kind: 'room', shape: 'round', floor: 1, position: [3, 0, 2], size: [6, 3.5, 6], screens: { count: 0, images: [] } })
  })

  it('pick by their circle and take no openings (curved walls)', () => {
    const r = roundRoom()
    expect(roomAtPoint([r], 0, 2.5, 0)?.id).toBe(r.id)
    expect(roomAtPoint([r], 0, 2.9, 2.9)).toBeUndefined() // in the bounding square's corner, outside the circle
    expect(wallAtPoint(r, { x: 3, z: 0 })).toBeNull()
  })

  it('resize by radius, switch shape (dropping openings for round), and follow the floor height', () => {
    const r = roundRoom()
    expect(resizeRound(r, 4.5).size).toEqual([9, 3, 9])
    expect(resizeRound(r, 0.1).size[0]).toBe(2)
    const rectRoom = { ...roomFrom(newRoom(rect(0, 0, 6, 4), 0, [])), openings: [newOpening('single-door', roomFrom(newRoom(rect(0, 0, 6, 4), 0, [])), 'north', 3)] }
    expect(reshapeRoom(rectRoom, 'round')).toMatchObject({ shape: 'round', size: [6, 3, 6], openings: [] })
    expect(reshapeRoom(r, 'rectangular')).toMatchObject({ shape: 'rectangular', size: [6, 3, 6], screens: undefined })
    let d: Design = { ...createDesign('F'), rooms: [r] }
    d = setFloorHeight(d, 0, 4)
    expect(d.rooms[0].size[1]).toBe(4)
  })

  it('turn the wall segments touching the tank to glass, rectangular or cylindrical', () => {
    const r = roundRoom() // wall centreline radius 3
    const box: FishTank = { id: 't', shape: 'rectangular', position: [5, 0], size: [4, 4] } // west face at x = 3
    const glass = roundTankContact(r, box)
    expect(glass.filter(Boolean).length).toBeGreaterThan(0)
    expect(glass.filter(Boolean).length).toBeLessThan(12)
    expect(glass[0] || glass[47]).toBe(true) // segments at angle 0 (+x) face the tank
    expect(roundTankContact(r, { ...box, position: [12, 0] }).some(Boolean)).toBe(false)
    expect(roundTankContact(r, { id: 'c', shape: 'cylindrical', position: [0, -5], size: [4, 4] }).some(Boolean)).toBe(true)
    // The glass segments leave the wall and become aquarium
    const walls = buildWallFaces([], [r], [], box)
    const full = buildWallFaces([], [r], [], null)
    expect(area(walls, 'warm-white')).toBeLessThan(area(full, 'warm-white'))
  })

  it('paint inside and outside faces of the curved wall separately', () => {
    const r = roundRoom()
    expect(wallFaceAt([r], { x: 2.9, y: 1, z: 0 }, { x: -1, y: 0, z: 0 })).toEqual({ roomId: r.id, face: 'curve-in' })
    expect(wallFaceAt([r], { x: 0, y: 1, z: -3.1 }, { x: 0, y: 0, z: -1 })).toEqual({ roomId: r.id, face: 'curve-out' })
    let d: Design = { ...createDesign('P'), rooms: [r] }
    d = paintDesign(d, { kind: 'wall', roomId: r.id, face: 'curve-in' }, 'gold')
    d = paintDesign(d, { kind: 'wall', roomId: r.id, face: 'curve-out' }, 'brick-red')
    const g = buildWallFaces([], d.rooms, [], null)
    // Inside face: the inner polygon's perimeter × height (48 flat segments).
    const inner = 48 * 2 * 2.9 * Math.sin(Math.PI / 48) * 3
    expect(area(g, 'gold')).toBeCloseTo(inner, 3)
    expect(area(g, 'brick-red')).toBeGreaterThan(area(g, 'gold'))
  })

  it('trim connector holes to the round slab', () => {
    const outline = roundOutline(roundRoom())
    const hole: [number, number][] = [[2, -0.5], [4, -0.5], [4, 0.5], [2, 0.5]] // pokes out of the circle
    const [cut] = holesInConvex(outline, [hole])
    expect(cut.every(([x, z]) => Math.hypot(x, z) < 3)).toBe(true)
    expect(polygonArea(cut)).toBeLessThan(2)
    expect(polygonArea(cut)).toBeGreaterThan(0.8)
  })
})

describe('screens', () => {
  it('fit by count, keep their images when the count changes, and stand inside the wall', () => {
    let r = roundRoom()
    expect(maxScreens(r)).toBeGreaterThan(20)
    r = { ...r, ...setScreenCount(r, 6) }
    r = { ...r, ...setScreenImage(r, 2, 'img-a') }
    expect(r.screens).toEqual({ count: 6, images: [null, null, 'img-a', null, null, null] })
    r = { ...r, ...setScreenCount(r, 3) }
    expect(r.screens?.images).toEqual([null, null, 'img-a'])
    expect(setScreenCount(r, 999).screens?.count).toBe(maxScreens(r))
    const panels = screenPanels({ ...r, ...setScreenCount(r, 8) })
    expect(panels).toHaveLength(8)
    expect(panels.every((p) => Math.hypot(p.x, p.z) < 2.9 && p.width > 1)).toBe(true)
  })
})

describe('images: by id, small designs, carried by exports', () => {
  it('downscale large images to 1280 px on the long side, never up', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('embed the images a design uses in its export, and restore them on import', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]).buffer
    const id = await imageId(bytes)
    expect(id).toMatch(/^img-[0-9a-f]{20}$/)
    await putImage({ id, name: 'mood.png', type: 'image/png', width: 2, height: 2, data: bytes, createdAt: '2026-11-04T00:00:00Z' })
    let r = roundRoom()
    r = { ...r, ...setScreenCount(r, 2) }
    r = { ...r, ...setScreenImage(r, 0, id) }
    const design: Design = { ...createDesign('Export'), rooms: [r] }
    expect(JSON.stringify(design)).not.toContain('iVBOR') // the design holds an id, never image data
    expect(imageIdsIn(design)).toEqual([id])
    const file = serialiseDesign(design, await embeddedImagesFor(design))
    // Elsewhere: an empty library
    await (await db()).clear('images')
    expect(await getImage(id)).toBeUndefined()
    const { design: opened, images } = parseDesignFile(file)
    expect(opened).toEqual(design)
    expect(opened).not.toHaveProperty('embeddedImages')
    await storeEmbeddedImages(images)
    expect(new Uint8Array((await getImage(id))!.data)).toEqual(new Uint8Array(bytes))
  })
})

describe('save format v7', () => {
  it('upgrades a v6 design: every room rectangular', () => {
    const v6 = { ...createDesign('Old'), version: 6, rooms: [{ ...roomFrom(newRoom(rect(0, 0, 4, 4), 0, [])), shape: undefined }] }
    const up = parseDesign(JSON.stringify(v6))
    expect(up.version).toBe(DESIGN_SCHEMA_VERSION)
    expect(DESIGN_SCHEMA_VERSION).toBe(7)
    expect(up.rooms[0].shape).toBe('rectangular')
  })
})
