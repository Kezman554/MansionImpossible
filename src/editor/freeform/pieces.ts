// Freeform pieces: placing, snapping, duplicating and converting to and from transforms.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { newId, type NewObject } from '../../store/designStore'
import type { Design, Euler3, Piece, PieceType, Vec3 } from '../../types/design'
import { PIECES, type PalettePiece } from './catalog'

export const ROTATION_SNAP_DEGREES = 15
export const SIZE_SNAP = 0.1
export const MIN_PIECE_SIZE = 0.05
/** Where Duplicate puts copies, relative to the originals (one grid step east and south). */
export const DUPLICATE_OFFSET: Vec3 = [1, 0, 1]

const round = (v: number) => Math.round(v * 1000) / 1000
export const snapTo = (v: number, step: number) => round(Math.round(v / step) * step)

/** A new palette piece with its base at (x, y, z) on a floor; x and z snap to the grid when snapping is on. */
export function newPiece(type: PalettePiece, floor: number, at: { x: number; y: number; z: number }, snap: number | null): NewObject {
  const spec = PIECES[type]
  const place = (v: number) => (snap ? snapTo(v, snap) : round(v))
  return {
    kind: 'piece',
    type,
    floor,
    position: [place(at.x), round(Math.max(0, at.y)), place(at.z)],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    size: [...spec.size],
    material: spec.material,
  }
}

/** Copies pieces one step along DUPLICATE_OFFSET; returns the new design and the copies' ids (one undo step). */
export function duplicatePieces(design: Design, ids: string[]): { design: Design; ids: string[] } {
  const copies = design.pieces
    .filter((p) => ids.includes(p.id))
    .map((p): Piece => ({ ...p, id: newId(), position: p.position.map((v, i) => round(v + DUPLICATE_OFFSET[i])) as Vec3 }))
  return { design: { ...design, pieces: [...design.pieces, ...copies] }, ids: copies.map((c) => c.id) }
}

const _position = new Vector3()
const _quaternion = new Quaternion()
const _scale = new Vector3()
const _euler = new Euler()

/** World matrix for a piece's unit geometry: position on its floor, rotation, size × scale. */
export function pieceMatrix(piece: Pick<Piece, 'position' | 'rotation' | 'scale' | 'size'>, elevation: number, target = new Matrix4()): Matrix4 {
  _position.set(piece.position[0], piece.position[1] + elevation, piece.position[2])
  _quaternion.setFromEuler(_euler.set(...piece.rotation))
  _scale.set(piece.size[0] * piece.scale[0], piece.size[1] * piece.scale[1], piece.size[2] * piece.scale[2])
  return target.compose(_position, _quaternion, _scale)
}

/**
 * The piece fields for a transform the gizmo produced: position back on the floor, rotation,
 * and size (the gizmo's scale is folded into size, so scale stays 1). Snapped when asked.
 */
export function pieceFromTransform(
  position: Vector3,
  rotation: Euler,
  scale: Vector3,
  base: Pick<Piece, 'size'>,
  elevation: number,
  snap: number | null,
): Pick<Piece, 'position' | 'rotation' | 'size' | 'scale'> {
  const s = (v: number) => (snap ? snapTo(v, snap) : round(v))
  const angle = (v: number) => (snap ? snapTo(v, (ROTATION_SNAP_DEGREES * Math.PI) / 180) : round(v))
  const size = base.size.map((v, i) => {
    const next = Math.max(MIN_PIECE_SIZE, v * [scale.x, scale.y, scale.z][i])
    return snap ? Math.max(SIZE_SNAP, snapTo(next, SIZE_SNAP)) : round(next)
  }) as Vec3
  return {
    position: [s(position.x), round(position.y - elevation), s(position.z)],
    rotation: [angle(rotation.x), angle(rotation.y), angle(rotation.z)] as Euler3,
    size,
    scale: [1, 1, 1],
  }
}

/** Pieces drawn together with one instanced mesh: same shape, same material. */
export const instanceKey = (p: Pick<Piece, 'type' | 'material'>) => `${p.type}|${p.material ?? ''}`

export function groupForInstancing(pieces: Piece[]): { key: string; type: PieceType; material: string | null; pieces: Piece[] }[] {
  const groups = new Map<string, Piece[]>()
  for (const p of pieces) groups.set(instanceKey(p), [...(groups.get(instanceKey(p)) ?? []), p])
  return [...groups].map(([key, list]) => ({ key, type: list[0].type, material: list[0].material, pieces: list }))
}
