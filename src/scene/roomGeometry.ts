// Wall layout for a floor's rooms, with shared walls merged so nothing is drawn twice.
//
// Every room edge lies on a wall centreline. Edges on the same line are cut at every
// endpoint; each stretch covered by any room becomes one wall piece (the tallest and
// thickest of the rooms that share it). At junctions, walls running along x own the
// corner squares and walls running along z stop at their faces, so no two wall faces
// are coplanar (which would flicker).
import { openingSpan } from '../editor/openings'
import { roomRect } from '../editor/roomTool'
import type { Room } from '../types/design'

export type Axis = 'x' | 'z'

export interface WallPiece {
  /** 'x': runs along x at z = line; 'z': runs along z at x = line. */
  axis: Axis
  line: number
  from: number
  to: number
  thickness: number
  height: number
  /** Id of the first room that owns this stretch (for its wall material). */
  roomId: string
}

interface Edge {
  axis: Axis
  line: number
  from: number
  to: number
  thickness: number
  height: number
  roomId: string
}

const EPS = 1e-6
const key = (axis: Axis, line: number) => `${axis}:${Math.round(line * 1e4)}`

function edgesOf(room: Room): Edge[] {
  const r = roomRect(room)
  const base = { thickness: room.wallThickness, height: room.size[1], roomId: room.id }
  return [
    { axis: 'x', line: r.z0, from: r.x0, to: r.x1, ...base },
    { axis: 'x', line: r.z1, from: r.x0, to: r.x1, ...base },
    { axis: 'z', line: r.x0, from: r.z0, to: r.z1, ...base },
    { axis: 'z', line: r.x1, from: r.z0, to: r.z1, ...base },
  ]
}

/** Merges the edges on one line into pieces: one per stretch with the same thickness and height. */
function mergeLine(edges: Edge[]): WallPiece[] {
  const cuts = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort((a, b) => a - b)
  const pieces: WallPiece[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]]
    const covering = edges.filter((e) => e.from <= a + EPS && e.to >= b - EPS)
    if (covering.length === 0) continue
    const thickness = Math.max(...covering.map((e) => e.thickness))
    const height = Math.max(...covering.map((e) => e.height))
    const last = pieces.at(-1)
    if (last && Math.abs(last.to - a) < EPS && last.thickness === thickness && last.height === height) last.to = b
    else pieces.push({ axis: edges[0].axis, line: edges[0].line, from: a, to: b, thickness, height, roomId: covering[0].roomId })
  }
  return pieces
}

/** Pieces of the other axis that cover point `at` on the line `line`. */
function crossing(pieces: WallPiece[], line: number, at: number): WallPiece[] {
  return pieces.filter((p) => Math.abs(p.line - at) < EPS && p.from <= line + EPS && p.to >= line - EPS)
}

const half = (pieces: WallPiece[]) => Math.max(0, ...pieces.map((p) => p.thickness)) / 2

/** All wall pieces for the given rooms (pass one floor's rooms at a time). */
export function layoutWalls(rooms: Room[]): WallPiece[] {
  const lines = new Map<string, Edge[]>()
  for (const edge of rooms.flatMap(edgesOf)) {
    const k = key(edge.axis, edge.line)
    lines.set(k, [...(lines.get(k) ?? []), edge])
  }
  const merged = [...lines.values()].flatMap(mergeLine)
  const alongX = merged.filter((p) => p.axis === 'x')
  const alongZ = merged.filter((p) => p.axis === 'z')

  // x walls: where the x line carries on (another piece starts here) leave the end alone;
  // at a corner (the z wall ends here) extend to cover the corner square; at a T (the z
  // wall carries on past) stop at the z wall's face.
  const continues = (p: WallPiece, end: number) => alongX.some((o) => o !== p && o.line === p.line && (Math.abs(o.from - end) < EPS || Math.abs(o.to - end) < EPS))
  const x = alongX.map((p) => {
    const adjust = (end: number, sign: 1 | -1) => {
      if (continues(p, end)) return end
      const others = crossing(alongZ, p.line, end)
      if (others.length === 0) return end
      const passesThrough = others.some((o) => o.from < p.line - EPS && o.to > p.line + EPS)
      return end + sign * (passesThrough ? -half(others) : half(others))
    }
    return { ...p, from: adjust(p.from, -1), to: adjust(p.to, 1) }
  })

  // z walls: cut out the band of every x wall that crosses them — at their ends (corners
  // and T-junctions) and part way along (crossings). Where x walls of different thickness
  // meet the same z wall, the thicker band is cut, which can leave a small notch.
  const z = alongZ.flatMap((p) => {
    const bands = x
      .filter((q) => q.from <= p.line + EPS && q.to >= p.line - EPS && q.line >= p.from - q.thickness && q.line <= p.to + q.thickness)
      .map((q) => [q.line - q.thickness / 2, q.line + q.thickness / 2] as const)
    const byLine = new Map<number, readonly [number, number]>()
    for (const band of bands) {
      const k = (band[0] + band[1]) / 2
      const existing = byLine.get(k)
      byLine.set(k, existing && existing[1] - existing[0] > band[1] - band[0] ? existing : band)
    }
    let spans: [number, number][] = [[p.from, p.to]]
    for (const [b0, b1] of [...byLine.values()].sort((a, b) => a[0] - b[0])) {
      spans = spans.flatMap(([s0, s1]): [number, number][] => {
        if (b1 <= s0 + EPS || b0 >= s1 - EPS) return [[s0, s1]]
        return ([[s0, Math.min(s1, b0)], [Math.max(s0, b1), s1]] as [number, number][]).filter(([a, b]) => b - a > EPS)
      })
    }
    return spans.map(([from, to]) => ({ ...p, from, to }))
  })

  return [...x, ...z].filter((p) => p.to - p.from > EPS)
}

/** A solid block of wall, in metres; y measured up from the floor. */
export interface WallBox {
  axis: Axis
  line: number
  from: number
  to: number
  bottom: number
  top: number
  thickness: number
  roomId: string
}

/**
 * The floor's walls as solid boxes with door and window holes cut out. Each merged wall
 * piece is split at every opening edge along its length; under an opening only the parts
 * below the sill and above the head remain. An opening on a shared wall cuts both rooms.
 */
export function layoutWallBoxes(rooms: Room[]): WallBox[] {
  const spans = rooms.flatMap((room) => room.openings.map((o) => openingSpan(room, o)))
  const boxes: WallBox[] = []

  for (const piece of layoutWalls(rooms)) {
    const holes = spans.filter((s) => s.axis === piece.axis && Math.abs(s.line - piece.line) < EPS && s.to > piece.from + EPS && s.from < piece.to - EPS)
    const solid = (from: number, to: number, bottom: number, top: number) => {
      if (to - from > EPS && top - bottom > EPS) boxes.push({ axis: piece.axis, line: piece.line, from, to, bottom, top, thickness: piece.thickness, roomId: piece.roomId })
    }
    if (holes.length === 0) {
      solid(piece.from, piece.to, 0, piece.height)
      continue
    }
    const cuts = [...new Set([piece.from, piece.to, ...holes.flatMap((h) => [h.from, h.to]).filter((v) => v > piece.from && v < piece.to)])].sort((a, b) => a - b)
    for (let i = 0; i < cuts.length - 1; i++) {
      const [a, b] = [cuts[i], cuts[i + 1]]
      const over = holes.filter((h) => h.from <= a + EPS && h.to >= b - EPS)
      if (over.length === 0) {
        solid(a, b, 0, piece.height)
        continue
      }
      // Solid where no hole covers: below the lowest sill and above the highest head
      // (overlapping holes on the same stretch merge into one).
      const bottom = Math.min(...over.map((h) => h.bottom))
      const top = Math.max(...over.map((h) => h.top))
      solid(a, b, 0, bottom)
      solid(a, b, top, piece.height)
    }
  }
  return mergeAdjacentBoxes(boxes)
}

/** Joins boxes that continue each other along the same wall with the same height band. */
function mergeAdjacentBoxes(boxes: WallBox[]): WallBox[] {
  const out: WallBox[] = []
  for (const box of boxes) {
    const last = out.at(-1)
    if (
      last &&
      last.axis === box.axis &&
      last.line === box.line &&
      last.thickness === box.thickness &&
      last.bottom === box.bottom &&
      last.top === box.top &&
      Math.abs(last.to - box.from) < EPS
    ) {
      last.to = box.to
    } else out.push({ ...box })
  }
  return out
}
