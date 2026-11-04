// Wall faces: which room's which face a spot on a wall belongs to, and the floor's walls built
// face by face so each face can take its own material.
//
// A wall face is named from a room: its north, east, south or west wall, 'in' (facing into the
// room) or 'out'. On a shared wall each side faces into one room, so each side is that room's
// inside face. A face with no room in front of it is the outside face of the room behind it.
// The same function names a face when it is clicked and when it is drawn, so they always agree.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { materialFor } from '../editor/catalog/materials'
import { roomRect } from '../editor/roomTool'
import type { CustomMaterial, Room, WallFace, WallSide } from '../types/design'
import { isRound, ROUND_SEGMENTS, roomCircle, roundTankContact, segmentEnds } from '../editor/roundRoom'
import type { FishTank } from '../types/design'
import type { WallBox } from './roomGeometry'

const EPS = 1e-6
/** Slack when matching a clicked point to a wall face, in metres. */
const HIT_SLACK = 0.03

export interface FaceRef {
  roomId: string
  face: WallFace
}

type P3 = { x: number; y: number; z: number }

/**
 * The wall face at a point on a wall with outward normal n, or null for tops, undersides and
 * reveals (those take the wall's own material).
 */
export function wallFaceAt(allRooms: Room[], p: P3, n: P3): FaceRef | null {
  if (Math.abs(n.y) > 0.5) return null
  // A round room's curved wall: facing its centre is the inside face, facing away the outside.
  for (const room of allRooms) {
    if (!isRound(room)) continue
    const c = roomCircle(room)
    const [dx, dz] = [p.x - c.cx, p.z - c.cz]
    if (Math.abs(Math.hypot(dx, dz) - c.r) > room.wallThickness / 2 + HIT_SLACK) continue
    return { roomId: room.id, face: n.x * dx + n.z * dz < 0 ? 'curve-in' : 'curve-out' }
  }
  const rooms = allRooms.filter((r) => !isRound(r))
  // Faces looking along z belong to walls running along x (north / south walls), and vice versa.
  const alongX = Math.abs(n.z) >= Math.abs(n.x)
  const across = alongX ? p.z : p.x
  const along = alongX ? p.x : p.z
  const sign = (alongX ? n.z : n.x) > 0 ? 1 : -1

  type Edge = { room: Room; line: number; lo: number; hi: number; low: boolean }
  const edges: Edge[] = rooms.flatMap((room) => {
    const r = roomRect(room)
    return alongX
      ? [{ room, line: r.z0, lo: r.x0, hi: r.x1, low: true }, { room, line: r.z1, lo: r.x0, hi: r.x1, low: false }]
      : [{ room, line: r.x0, lo: r.z0, hi: r.z1, low: true }, { room, line: r.x1, lo: r.z0, hi: r.z1, low: false }]
  })
  // The nearest wall centreline behind the face (the face sits half a thickness out from it).
  const behind = edges.filter((e) => (across - e.line) * sign >= -EPS && Math.abs(across - e.line) <= e.room.wallThickness / 2 + HIT_SLACK)
  if (behind.length === 0) return null
  const line = behind.reduce((best, e) => (Math.abs(across - e.line) < Math.abs(across - best) ? e.line : best), behind[0].line)
  const onLine = edges.filter((e) => Math.abs(e.line - line) < EPS && along >= e.lo - EPS && along <= e.hi + EPS)

  // A room on the face's side whose wall this is faces in; else the room behind it faces out.
  // low = the room's north (x walls) or west (z walls) edge: the room lies on its + side.
  const sideName = (low: boolean): WallSide => (alongX ? (low ? 'north' : 'south') : low ? 'west' : 'east')
  const inside = onLine.find((e) => e.low === sign > 0)
  if (inside) return { roomId: inside.room.id, face: `${sideName(inside.low)}-in` }
  const outside = onLine.find((e) => e.low !== sign > 0)
  return outside ? { roomId: outside.room.id, face: `${sideName(outside.low)}-out` } : null
}

/** The material id a wall face is drawn in: its own, else the room's walls, else the default. */
export function faceMaterialId(room: Room | undefined, face: WallFace | null, custom: readonly CustomMaterial[] = []): string {
  const id = (face && room?.materials.faces?.[face]) || room?.materials.walls || null
  return materialFor(id, 'walls', custom).id
}

interface Quad {
  corners: [P3, P3, P3, P3]
  normal: P3
}

/** A box's six faces; the two long faces split wherever a room's wall starts or ends along them. */
function boxQuads(b: WallBox, cutsAlong: number[]): Quad[] {
  const t = b.thickness / 2
  // Local frame: a = along the wall, c = across it. pt maps to world.
  const pt = (a: number, y: number, c: number): P3 => (b.axis === 'x' ? { x: a, y, z: c } : { x: c, y, z: a })
  const dir = (da: number, dy: number, dc: number): P3 => (b.axis === 'x' ? { x: da, y: dy, z: dc } : { x: dc, y: dy, z: da })
  const [c0, c1] = [b.line - t, b.line + t]
  const quads: Quad[] = []
  const cuts = [b.from, ...cutsAlong.filter((v) => v > b.from + EPS && v < b.to - EPS).sort((x, y) => x - y), b.to]
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a0, a1] = [cuts[i], cuts[i + 1]]
    quads.push({ corners: [pt(a0, b.bottom, c1), pt(a1, b.bottom, c1), pt(a1, b.top, c1), pt(a0, b.top, c1)], normal: dir(0, 0, 1) })
    quads.push({ corners: [pt(a1, b.bottom, c0), pt(a0, b.bottom, c0), pt(a0, b.top, c0), pt(a1, b.top, c0)], normal: dir(0, 0, -1) })
  }
  quads.push({ corners: [pt(b.from, b.top, c0), pt(b.from, b.top, c1), pt(b.to, b.top, c1), pt(b.to, b.top, c0)], normal: dir(0, 1, 0) })
  if (b.bottom > EPS) quads.push({ corners: [pt(b.from, b.bottom, c1), pt(b.from, b.bottom, c0), pt(b.to, b.bottom, c0), pt(b.to, b.bottom, c1)], normal: dir(0, -1, 0) })
  quads.push({ corners: [pt(b.to, b.bottom, c1), pt(b.to, b.bottom, c0), pt(b.to, b.top, c0), pt(b.to, b.top, c1)], normal: dir(1, 0, 0) })
  quads.push({ corners: [pt(b.from, b.bottom, c0), pt(b.from, b.bottom, c1), pt(b.from, b.top, c1), pt(b.from, b.top, c0)], normal: dir(-1, 0, 0) })
  // The local frame flips handedness for z walls; keep every quad wound counter-clockwise outward.
  if (b.axis === 'z') for (const q of quads) q.corners.reverse()
  return quads
}

/** A quad from four corners, wound counter-clockwise as seen from the side its normal points to. */
function quad(corners: [P3, P3, P3, P3], normal: P3): Quad {
  const [a, b, c] = corners
  const [ux, uy, uz, vx, vy, vz] = [b.x - a.x, b.y - a.y, b.z - a.z, c.x - a.x, c.y - a.y, c.z - a.z]
  const facing = (uy * vz - uz * vy) * normal.x + (uz * vx - ux * vz) * normal.y + (ux * vy - uy * vx) * normal.z
  return { corners: facing < 0 ? [corners[3], corners[2], corners[1], corners[0]] : corners, normal }
}

/**
 * A round room's curved wall as flat segments. Segments against the tank are left out of the
 * wall and returned as aquarium glass; where the wall meets the glass, its cut ends are capped.
 */
export function roundWallQuads(room: Room, tank: FishTank | null): { inside: Quad[]; outside: Quad[]; plain: Quad[]; glass: Quad[] } {
  const c = roomCircle(room)
  const t = room.wallThickness / 2
  const h = room.size[1]
  const glassAt = roundTankContact(room, tank)
  const out = { inside: [] as Quad[], outside: [] as Quad[], plain: [] as Quad[], glass: [] as Quad[] }
  for (let i = 0; i < ROUND_SEGMENTS; i++) {
    const [[ix0, iz0], [ix1, iz1]] = segmentEnds(c, i, c.r - t)
    const [[ox0, oz0], [ox1, oz1]] = segmentEnds(c, i, c.r + t)
    const mid = ((i + 0.5) / ROUND_SEGMENTS) * Math.PI * 2
    const radial = { x: Math.cos(mid), y: 0, z: Math.sin(mid) }
    const p = (x: number, y: number, z: number): P3 => ({ x, y, z })
    const innerFace = quad([p(ix0, 0, iz0), p(ix1, 0, iz1), p(ix1, h, iz1), p(ix0, h, iz0)], { x: -radial.x, y: 0, z: -radial.z })
    const outerFace = quad([p(ox0, 0, oz0), p(ox1, 0, oz1), p(ox1, h, oz1), p(ox0, h, oz0)], radial)
    const top = quad([p(ix0, h, iz0), p(ix1, h, iz1), p(ox1, h, oz1), p(ox0, h, oz0)], { x: 0, y: 1, z: 0 })
    if (glassAt[i]) {
      const bottom = quad([p(ix0, 0, iz0), p(ix1, 0, iz1), p(ox1, 0, oz1), p(ox0, 0, oz0)], { x: 0, y: -1, z: 0 })
      out.glass.push(innerFace, outerFace, top, bottom)
      continue
    }
    out.inside.push(innerFace)
    out.outside.push(outerFace)
    out.plain.push(top)
    // Cap the wall where the next or previous segment turns to glass.
    const capAt = (k: 0 | 1) => {
      const a = ((i + k) / ROUND_SEGMENTS) * Math.PI * 2
      const [x0, z0, x1, z1] = [c.cx + Math.cos(a) * (c.r - t), c.cz + Math.sin(a) * (c.r - t), c.cx + Math.cos(a) * (c.r + t), c.cz + Math.sin(a) * (c.r + t)]
      const sign = k === 1 ? 1 : -1
      out.plain.push(quad([p(x0, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z0)], { x: -Math.sin(a) * sign, y: 0, z: Math.cos(a) * sign }))
    }
    if (glassAt[(i + ROUND_SEGMENTS - 1) % ROUND_SEGMENTS]) capAt(0)
    if (glassAt[(i + 1) % ROUND_SEGMENTS]) capAt(1)
  }
  return out
}

/** Glass segments of round rooms' walls touching the tank, as one geometry (or null). */
export function buildRoundGlass(rooms: Room[], tank: FishTank | null): BufferGeometry | null {
  const quads = rooms.filter(isRound).flatMap((r) => roundWallQuads(r, tank).glass)
  return quads.length ? quadGeometry(quads) : null
}

/** Two triangles per quad with world-scale UVs (metres across the face), grouped into one geometry. */
function quadGeometry(quads: Quad[]): BufferGeometry {
  const position: number[] = []
  const normal: number[] = []
  const uv: number[] = []
  for (const q of quads) {
    const n = q.normal
    const flat = Math.abs(n.y) > 0.5
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = q.corners[i]
      position.push(c.x, c.y, c.z)
      normal.push(n.x, n.y, n.z)
      uv.push(flat ? c.x : Math.abs(n.x) > 0.5 ? c.z : c.x, flat ? c.z : c.y)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(position, 3))
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return g
}

/**
 * The floor's walls, face by face, as one geometry per material: each face takes the material
 * of the room face it belongs to (see wallFaceAt); tops, undersides and reveals take the wall's
 * owning room's walls material.
 */
export function buildWallFaces(boxes: WallBox[], rooms: Room[], custom: readonly CustomMaterial[] = [], tank: FishTank | null = null): { key: string; geometry: BufferGeometry }[] {
  const byId = new Map(rooms.map((r) => [r.id, r]))
  const groups = new Map<string, Quad[]>()
  const add = (id: string, quads: Quad[]) => quads.length && groups.set(id, [...(groups.get(id) ?? []), ...quads])
  // Round rooms: the curved wall's inside and outside faces take their own materials.
  for (const room of rooms.filter(isRound)) {
    const q = roundWallQuads(room, tank)
    add(faceMaterialId(room, 'curve-in', custom), q.inside)
    add(faceMaterialId(room, 'curve-out', custom), q.outside)
    add(faceMaterialId(room, null, custom), q.plain)
  }
  for (const b of boxes) {
    const cuts = rooms.filter((r) => !isRound(r)).flatMap((r) => {
      const rect = roomRect(r)
      return b.axis === 'x' ? [rect.x0, rect.x1] : [rect.z0, rect.z1]
    })
    for (const q of boxQuads(b, cuts)) {
      const mid = q.corners.reduce((s, c) => ({ x: s.x + c.x / 4, y: s.y + c.y / 4, z: s.z + c.z / 4 }), { x: 0, y: 0, z: 0 })
      const ref = wallFaceAt(rooms, mid, q.normal)
      const id = ref ? faceMaterialId(byId.get(ref.roomId), ref.face, custom) : faceMaterialId(byId.get(b.roomId), null, custom)
      groups.set(id, [...(groups.get(id) ?? []), q])
    }
  }
  return [...groups].map(([key, quads]) => ({ key, geometry: quadGeometry(quads) }))
}
