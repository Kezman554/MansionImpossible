import { beforeEach, describe, expect, it } from 'vitest'
import {
  customMaterial,
  DEFAULT_SURFACE_MATERIAL,
  MATERIAL_CATEGORIES,
  MATERIALS,
  OPENING_MATERIALS,
  pickableMaterials,
  resolveMaterial,
  TANK_MATERIALS,
} from '../src/editor/catalog/materials'
import { TEXTURE_KINDS, TEXTURE_SIZE, texturePixels } from '../src/editor/catalog/textures'
import { CONNECTORS } from '../src/editor/connectors/catalog'
import { PIECES } from '../src/editor/freeform/catalog'
import { applyPaint, paintDesign, paintedMaterial } from '../src/editor/paint'
import { placementFromRect, type Rect } from '../src/editor/roomTool'
import { layoutWallBoxes } from '../src/scene/roomGeometry'
import { buildWallFaces, wallFaceAt } from '../src/scene/wallFaces'
import { migrateDesign } from '../src/storage/migrateDesign'
import { parseDesign, serialiseDesign } from '../src/storage/designFile'
import { createDesign, useDesignStore } from '../src/store/designStore'
import { useEditorStore } from '../src/store/editorStore'
import { DESIGN_SCHEMA_VERSION, type Design, type Room } from '../src/types/design'

function room(id: string, rect: Rect): Room {
  return {
    id, kind: 'room', name: id, type: 'Room', floor: 0, ...placementFromRect(rect, 3), rotation: [0, 0, 0], scale: [1, 1, 1],
    wallThickness: 0.2, openings: [], materials: { floor: null, walls: null, ceiling: null, faces: {} },
  }
}

describe('one catalogue', () => {
  it('has wood, marble, tile, carpet, glass, metal, concrete, brick and plain colours to pick', () => {
    expect(MATERIAL_CATEGORIES.map((c) => c.id)).toEqual(['wood', 'marble', 'tile', 'carpet', 'glass', 'metal', 'concrete', 'brick', 'plain'])
    for (const c of MATERIAL_CATEGORIES) expect(pickableMaterials(c.id).length, c.id).toBeGreaterThan(0)
    expect(MATERIALS.gold.category).toBe('metal')
  })

  it("keeps K's connector materials and I's tank glass and water in it", () => {
    for (const id of ['steel', 'brass', 'slide-yellow', TANK_MATERIALS.glass, TANK_MATERIALS.water]) expect(MATERIALS[id], id).toBeDefined()
    expect(MATERIALS.water.hidden).toBe(true)
  })

  it('resolves every material any part of the app names', () => {
    const named = [
      ...Object.values(OPENING_MATERIALS),
      ...Object.values(DEFAULT_SURFACE_MATERIAL),
      ...Object.values(TANK_MATERIALS),
      ...Object.values(CONNECTORS).map((c) => c.material),
      ...Object.values(PIECES).map((p) => p.material),
    ]
    for (const id of named) expect(resolveMaterial(id), id).toBeDefined()
    for (const m of Object.values(MATERIALS)) expect(m.color, m.id).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('turns a custom colour into a flat material whose id carries the colour', () => {
    const c = customMaterial('#3366AA')
    expect(c).toMatchObject({ id: 'custom-3366aa', color: '#3366aa' })
    expect(resolveMaterial(c.id)?.color).toBe('#3366aa')
    expect(resolveMaterial('custom-zz')).toBeUndefined()
  })
})

describe('textures', () => {
  it('generates every pattern in code: small, grey, opaque and not flat', () => {
    for (const kind of TEXTURE_KINDS) {
      const px = texturePixels(kind)
      expect(px.length).toBe(TEXTURE_SIZE * TEXTURE_SIZE * 4)
      const values = new Set<number>()
      for (let i = 0; i < px.length; i += 4) {
        expect(px[i] === px[i + 1] && px[i] === px[i + 2] && px[i + 3] === 255).toBe(true)
        values.add(px[i])
      }
      expect(values.size, kind).toBeGreaterThan(4)
    }
  })

  it('tiles: the left and right edges, and the top and bottom, join smoothly', () => {
    for (const kind of ['marble', 'concrete', 'carpet'] as const) {
      const px = texturePixels(kind)
      const at = (x: number, y: number) => px[(y * TEXTURE_SIZE + x) * 4]
      let seam = 0
      let inner = 0
      for (let y = 0; y < TEXTURE_SIZE; y++) {
        seam += Math.abs(at(TEXTURE_SIZE - 1, y) - at(0, y))
        inner += Math.abs(at(TEXTURE_SIZE / 2, y) - at(TEXTURE_SIZE / 2 - 1, y))
      }
      expect(seam, kind).toBeLessThan(inner * 2.5 + TEXTURE_SIZE * 4)
    }
  })
})

describe('wall faces', () => {
  // A and B share the wall at x = 4.
  const rooms = [room('A', { x0: 0, z0: 0, x1: 4, z1: 4 }), room('B', { x0: 4, z0: 0, x1: 8, z1: 4 })]

  it('names each side of a shared wall as the inside face of the room it faces', () => {
    expect(wallFaceAt(rooms, { x: 3.9, y: 1, z: 2 }, { x: -1, y: 0, z: 0 })).toEqual({ roomId: 'A', face: 'east-in' })
    expect(wallFaceAt(rooms, { x: 4.1, y: 1, z: 2 }, { x: 1, y: 0, z: 0 })).toEqual({ roomId: 'B', face: 'west-in' })
  })

  it('names outer faces as the outside of the room behind them', () => {
    expect(wallFaceAt(rooms, { x: -0.1, y: 1, z: 2 }, { x: -1, y: 0, z: 0 })).toEqual({ roomId: 'A', face: 'west-out' })
    expect(wallFaceAt(rooms, { x: 6, y: 1, z: -0.1 }, { x: 0, y: 0, z: -1 })).toEqual({ roomId: 'B', face: 'north-out' })
    expect(wallFaceAt(rooms, { x: 6, y: 1, z: 0.1 }, { x: 0, y: 0, z: 1 })).toEqual({ roomId: 'B', face: 'north-in' })
    expect(wallFaceAt(rooms, { x: 2, y: 3, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
  })

  it('draws a painted face in its material and leaves the other side of the wall alone', () => {
    const painted = rooms.map((r) => (r.id === 'A' ? { ...r, materials: { ...r.materials, faces: { 'east-in': 'gold' } } } : r))
    const groups = buildWallFaces(layoutWallBoxes(painted), painted)
    const area = (key: string) => {
      const g = groups.find((x) => x.key === key)?.geometry
      if (!g) return 0
      const p = g.getAttribute('position')
      let sum = 0
      for (let i = 0; i < p.count; i += 3) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2].flatMap((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
        const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az]
        sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
      }
      return sum
    }
    expect(area('gold')).toBeCloseTo((4 - 0.2) * 3, 5) // the inner face of A's east wall, between its corners
    expect(area('warm-white')).toBeGreaterThan(0)
    // Walls without faces painted use the room's walls material, then the default.
    const allOak = rooms.map((r) => ({ ...r, materials: { ...r.materials, walls: 'oak' } }))
    expect(buildWallFaces(layoutWallBoxes(allOak), allOak).map((g) => g.key)).toEqual(['oak'])
  })
})

describe('painting', () => {
  let design: Design
  beforeEach(() => {
    design = { ...createDesign('P'), rooms: [room('A', { x0: 0, z0: 0, x1: 4, z1: 4 })] }
    design = { ...design, pieces: [{ id: 'p1', kind: 'piece', type: 'pillar', floor: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 3, 1], material: 'marble' }] }
  })

  it('paints a wall face, floor, ceiling or piece', () => {
    let d = paintDesign(design, { kind: 'wall', roomId: 'A', face: 'north-out' }, 'brick-red')
    d = paintDesign(d, { kind: 'floor', roomId: 'A' }, 'carpet-red')
    d = paintDesign(d, { kind: 'ceiling', roomId: 'A' }, 'gold')
    d = paintDesign(d, { kind: 'piece', pieceId: 'p1' }, 'copper')
    expect(d.rooms[0].materials).toMatchObject({ floor: 'carpet-red', ceiling: 'gold', faces: { 'north-out': 'brick-red' } })
    expect(paintedMaterial(d, { kind: 'wall', roomId: 'A', face: 'north-in' })).toBeNull()
    expect(d.pieces[0].material).toBe('copper')
  })

  it('changes nothing for the same material, an unknown material or a missing target', () => {
    expect(paintDesign(design, { kind: 'piece', pieceId: 'p1' }, 'marble')).toBe(design)
    expect(paintDesign(design, { kind: 'floor', roomId: 'A' }, 'no-such')).toBe(design)
    expect(paintDesign(design, { kind: 'floor', roomId: 'Z' }, 'oak')).toBe(design)
  })

  it('saves a custom colour with the design the first time it is used', () => {
    const id = customMaterial('#123456').id
    let d = paintDesign(design, { kind: 'floor', roomId: 'A' }, id)
    d = paintDesign(d, { kind: 'piece', pieceId: 'p1' }, id)
    expect(d.customMaterials).toEqual([customMaterial('#123456')])
  })

  it('is one undo step per click, none when nothing changes', () => {
    useDesignStore.getState().loadDesign(design)
    useEditorStore.getState().setPaintMaterial('walnut')
    applyPaint({ kind: 'floor', roomId: 'A' })
    applyPaint({ kind: 'floor', roomId: 'A' })
    applyPaint({ kind: 'wall', roomId: 'A', face: 'east-in' })
    expect(useDesignStore.getState().past.length).toBe(2)
    useDesignStore.getState().undo()
    expect(useDesignStore.getState().design.rooms[0].materials.faces?.['east-in']).toBeUndefined()
    expect(useDesignStore.getState().design.rooms[0].materials.floor).toBe('walnut')
  })
})

describe('save format v5', () => {
  it('upgrades a v4 design: per-face materials, custom colours, connector toFloor, no fish-tank pieces', () => {
    const v4 = {
      ...createDesign('Old'),
      version: 4,
      customMaterials: undefined,
      rooms: [{ ...room('A', { x0: 0, z0: 0, x1: 4, z1: 4 }), materials: { floor: 'marble', walls: 'oak', ceiling: null } }],
      pieces: [
        { id: 'f', kind: 'piece', type: 'fish-tank', floor: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [3, 9, 3], material: null },
        { id: 's', kind: 'piece', type: 'stairs', floor: 1, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1.2, 3, 4], material: 'oak' },
        { id: 'k', kind: 'piece', type: 'elevator', floor: 0, toFloor: 2, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [2, 9, 2], material: 'steel' },
      ],
    }
    const json = JSON.stringify(v4)
    const up = parseDesign(json)
    expect(up.version).toBe(DESIGN_SCHEMA_VERSION)
    expect(DESIGN_SCHEMA_VERSION).toBeGreaterThanOrEqual(5)
    expect(up.rooms[0].materials).toEqual({ floor: 'marble', walls: 'oak', ceiling: null, faces: {} })
    expect(up.customMaterials).toEqual([])
    expect(up.pieces.map((p) => `${p.id}:${p.toFloor}`)).toEqual(['s:1', 'k:2'])
    expect(migrateDesign(JSON.parse(json)).pieces).toHaveLength(2)
  })

  it('round-trips painted designs and rejects a broken custom colour', () => {
    const d = paintDesign({ ...createDesign('R'), rooms: [room('A', { x0: 0, z0: 0, x1: 4, z1: 4 })] }, { kind: 'wall', roomId: 'A', face: 'west-in' }, customMaterial('#abcdef').id)
    expect(parseDesign(serialiseDesign(d))).toEqual(d)
    expect(() => parseDesign(serialiseDesign({ ...d, customMaterials: [{ id: 'x', name: 'x', color: 'red', roughness: 1 }] }))).toThrow('customMaterials')
  })
})
