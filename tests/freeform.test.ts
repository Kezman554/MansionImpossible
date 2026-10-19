import { Euler, Quaternion, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { editorActionFor } from '../src/editor/editorShortcuts'
import { PIECE_PALETTE, PIECES, pieceLabel } from '../src/editor/freeform/catalog'
import { pieceGeometry } from '../src/editor/freeform/geometry'
import { duplicatePieces, groupForInstancing, newPiece, pieceFromTransform, pieceMatrix } from '../src/editor/freeform/pieces'
import { createDesign, useDesignStore } from '../src/store/designStore'
import type { Piece } from '../src/types/design'

const store = () => useDesignStore.getState()
const piece = (over: Partial<Piece> = {}): Piece => ({ ...(newPiece('pillar', 0, { x: 0, y: 0, z: 0 }, 0.5) as Piece), id: `p${Math.random()}`, ...over })

describe('piece palette', () => {
  it('offers walls, floor panels, domes, tubes, platforms, pillars, arches and ramps', () => {
    expect(PIECE_PALETTE.map((t) => PIECES[t].label)).toEqual(['Wall segment', 'Floor panel', 'Dome', 'Glass tube', 'Platform', 'Pillar', 'Arch', 'Ramp'])
    expect(pieceLabel('fireman-pole')).toBe('Fireman pole')
  })

  it('gives every shape a unit geometry filling x, z ∈ [-0.5, 0.5] and y ∈ [0, 1]', () => {
    for (const type of PIECE_PALETTE) {
      const box = pieceGeometry(type).boundingBox!
      expect([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => Math.round(v * 1000) / 1000), type).toEqual([-0.5, 0, -0.5, 0.5, 1, 0.5])
    }
  })

  it('shares one geometry per shape', () => {
    expect(pieceGeometry('pillar')).toBe(pieceGeometry('pillar'))
  })
})

describe('placing pieces', () => {
  it('places at any point, snapping x and z to the grid when snap is on', () => {
    expect(newPiece('pillar', 1, { x: 1.26, y: 0, z: -0.74 }, 0.5)).toMatchObject({ kind: 'piece', type: 'pillar', floor: 1, position: [1.5, 0, -0.5], size: [0.5, 3, 0.5], material: 'marble' })
    expect(newPiece('pillar', 0, { x: 1.26, y: 0, z: -0.74 }, null).position).toEqual([1.26, 0, -0.74])
  })

  it('keeps any height (stacked on another piece), never below the floor', () => {
    expect(newPiece('dome', 0, { x: 0, y: 3.4, z: 0 }, 0.5).position[1]).toBe(3.4)
    expect(newPiece('dome', 0, { x: 0, y: -1, z: 0 }, 0.5).position[1]).toBe(0)
  })

  it('makes glass tubes glass by default', () => {
    expect(newPiece('tube', 0, { x: 0, y: 5, z: 0 }, null).material).toBe('glass')
  })
})

describe('transforms', () => {
  it('puts a piece in the world: floor height added, rotation applied, size as scale', () => {
    const m = pieceMatrix(piece({ position: [2, 1, 3], rotation: [0, Math.PI / 2, 0], size: [4, 2, 1] }), 6)
    const p = new Vector3()
    const q = new Quaternion()
    const s = new Vector3()
    m.decompose(p, q, s)
    expect(p.toArray().map((v) => +v.toFixed(6))).toEqual([2, 7, 3])
    expect(s.toArray().map((v) => +v.toFixed(6))).toEqual([4, 2, 1])
    expect(new Euler().setFromQuaternion(q).y).toBeCloseTo(Math.PI / 2)
  })

  it('reads a gizmo transform back: position on the floor, scale folded into size, snapped', () => {
    const base = piece({ size: [0.5, 3, 0.5] })
    const result = pieceFromTransform(new Vector3(1.27, 9.4, -2.1), new Euler(0, 0.27, 0), new Vector3(2, 1.5, 2), base, 6, 0.5)
    expect(result.position).toEqual([1.5, 3.4, -2])
    expect(result.rotation[1]).toBeCloseTo((15 * Math.PI) / 180)
    expect(result.size).toEqual([1, 4.5, 1])
    expect(result.scale).toEqual([1, 1, 1])
  })

  it('is exact without snapping', () => {
    const r = pieceFromTransform(new Vector3(1.27, 0.33, 0), new Euler(0, 0.27, 0), new Vector3(1, 1, 1), piece(), 0, null)
    expect(r.position).toEqual([1.27, 0.33, 0])
    expect(r.rotation[1]).toBe(0.27)
  })
})

describe('instancing', () => {
  it('draws identical pieces (same shape and material) together', () => {
    const pillars = Array.from({ length: 200 }, () => piece())
    const glass = piece({ type: 'tube', material: 'glass' })
    const gold = piece({ material: 'oak' })
    const groups = groupForInstancing([...pillars, glass, gold])
    expect(groups.map((g) => [g.type, g.material, g.pieces.length])).toEqual([
      ['pillar', 'marble', 200],
      ['tube', 'glass', 1],
      ['pillar', 'oak', 1],
    ])
  })
})

describe('duplicate', () => {
  beforeEach(() => store().loadDesign(createDesign('Test')))

  it('copies the selected pieces one step along, as one undo step', () => {
    const a = store().addObject(newPiece('pillar', 0, { x: 0, y: 0, z: 0 }, 0.5))
    const b = store().addObject(newPiece('arch', 0, { x: 4, y: 0, z: 0 }, 0.5))
    const steps = store().past.length
    const { design, ids } = duplicatePieces(store().design, [a, b])
    store().applyDesign(design)
    expect(ids).toHaveLength(2)
    expect(store().design.pieces.filter((p) => ids.includes(p.id)).map((p) => p.position)).toEqual([[1, 0, 1], [5, 0, 1]])
    expect(store().past.length).toBe(steps + 1)
    store().undo()
    expect(store().design.pieces).toHaveLength(2)
  })
})

describe('freeform shortcuts', () => {
  const key = (k: string, mods = {}) => editorActionFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...mods })
  it('F, M, T, S and Ctrl+D', () => {
    expect([key('f'), key('m'), key('t'), key('s'), key('d', { ctrlKey: true })]).toEqual(['freeform-tool', 'gizmo-move', 'gizmo-rotate', 'gizmo-scale', 'duplicate'])
    expect(key('s', { ctrlKey: true })).toBeNull() // Ctrl+S stays the browser's
  })
})
