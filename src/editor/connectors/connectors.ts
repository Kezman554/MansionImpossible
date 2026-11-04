// Vertical connectors: which floors they join, how big they are, and the holes they cut.
//
// A connector is a freeform piece (moved, rotated, duplicated and deleted like one) that runs
// from its `floor` (the lower) up to its `toFloor`. Its height — and for straight stairs and
// slides, its run — are never chosen: they are fitted to the floors as they are now, so a
// connector follows floor height changes. It cuts a hole of its footprint in every floor it
// passes up through (the floors above its start, up to and including the one it reaches) and in
// the ceilings below those.
import type { NewObject } from '../../store/designStore'
import type { Design, Floor, Piece, Vec3 } from '../../types/design'
import type { Rect } from '../roomTool'
import { CONNECTORS, isConnectorType, type ConnectorType } from './catalog'

/** Tallest step riser, and each step's going (depth), in metres. */
export const MAX_RISER = 0.19
export const STEP_GOING = 0.28
/** Straight slides fall at this angle, then run out flat for this far at the bottom. */
export const SLIDE_ANGLE_DEGREES = 35
export const SLIDE_RUNOUT = 1.2
export const CONNECTOR_LIMITS = { width: { min: 0.3, max: 12 } } as const
/** Height used when a connector has no floor above it to reach. */
const FALLBACK_HEIGHT = 3
const CIRCLE_SEGMENTS = 24

type Plan = [number, number]
const round = (v: number) => Math.round(v * 1000) / 1000

export const isConnector = (p: Pick<Piece, 'type'>): boolean => isConnectorType(p.type)

/** Lower and upper floor indexes a connector joins (equal when it has nowhere to go). */
export function connectorFloors(p: Pick<Piece, 'floor' | 'toFloor'>): { from: number; to: number } {
  const to = p.toFloor ?? p.floor
  return { from: Math.min(p.floor, to), to: Math.max(p.floor, to) }
}

/** True if a piece is on a floor: on it, or (connectors) spanning it. */
export function pieceOnFloor(p: Pick<Piece, 'type' | 'floor' | 'toFloor'>, floor: number): boolean {
  if (!isConnector(p)) return p.floor === floor
  const { from, to } = connectorFloors(p)
  return floor >= from && floor <= to
}

export interface ConnectorSpan {
  from: number
  to: number
  /** y of its base (the start floor's surface) and its top, in metres. */
  bottom: number
  top: number
}

/**
 * The connector's vertical extent: from its start floor's surface to the end floor's surface
 * (an elevator shaft carries on to the top of the end floor). With nowhere to go it reaches
 * its own floor's ceiling.
 */
export function connectorSpan(p: Pick<Piece, 'type' | 'floor' | 'toFloor'>, floors: Floor[]): ConnectorSpan {
  const { from, to } = connectorFloors(p)
  const start = floors.find((f) => f.index === from)
  const end = floors.find((f) => f.index === to)
  const bottom = start?.elevation ?? from * FALLBACK_HEIGHT
  let top = to > from && end ? end.elevation : bottom + (start?.height ?? FALLBACK_HEIGHT)
  if (p.type === 'elevator' && to > from && end) top = end.elevation + end.height
  return { from, to, bottom, top: Math.max(top, bottom + 0.5) }
}

/** Steps in a flight rising `height`: none taller than MAX_RISER. */
export const stepCount = (height: number) => Math.max(1, Math.ceil(height / MAX_RISER - 1e-9))

/** The connector's size fitted to its floors: [width, height, depth or run] in metres. */
export function connectorSize(p: Pick<Piece, 'type' | 'floor' | 'toFloor' | 'size'>, floors: Floor[]): Vec3 {
  const span = connectorSpan(p, floors)
  const h = round(span.top - span.bottom)
  const type = p.type as ConnectorType
  const spec = CONNECTORS[type]
  const w = p.size[0]
  if (spec.round) return [w, h, w]
  if (type === 'stairs') return [w, h, round(stepCount(h) * STEP_GOING)]
  if (type === 'slide') return [w, h, round(h / Math.tan((SLIDE_ANGLE_DEGREES * Math.PI) / 180) + SLIDE_RUNOUT)]
  return [w, h, p.size[2]]
}

/**
 * Default floors for a new connector placed on the active floor: up to the floor above; on the
 * top floor, up from the floor below; with one floor, just that floor.
 */
export function defaultConnectorFloors(floors: Floor[], active: number): { floor: number; toFloor: number } {
  if (floors.some((f) => f.index === active + 1)) return { floor: active, toFloor: active + 1 }
  if (floors.some((f) => f.index === active - 1)) return { floor: active - 1, toFloor: active }
  return { floor: active, toFloor: active }
}

/** A new connector centred at (x, z), on the floors defaultConnectorFloors picks, sized to fit. */
export function newConnector(type: ConnectorType, floors: Floor[], active: number, at: { x: number; z: number }, snap: number | null): NewObject {
  const spec = CONNECTORS[type]
  const place = (v: number) => (snap ? round(Math.round(v / snap) * snap) : round(v))
  const span = defaultConnectorFloors(floors, active)
  const base = { type, ...span, size: [spec.footprint[0], 0, spec.footprint[1]] as Vec3 }
  return {
    kind: 'piece',
    ...base,
    position: [place(at.x), 0, place(at.z)],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    size: connectorSize(base, floors),
    material: spec.material,
  }
}

/** Sets the floors a connector joins (in either order) and refits its size. */
export function setConnectorFloors(p: Piece, a: number, b: number, floors: Floor[]): Pick<Piece, 'floor' | 'toFloor' | 'size' | 'position'> {
  const next = { ...p, floor: Math.min(a, b), toFloor: Math.max(a, b) }
  return { floor: next.floor, toFloor: next.toFloor, size: connectorSize(next, floors), position: [p.position[0], 0, p.position[2]] }
}

/** Sets the width (diameter for round ones) or depth (elevators), clamped, and refits. */
export function resizeConnector(p: Piece, axis: 'x' | 'z', value: number, floors: Floor[]): Pick<Piece, 'size'> {
  const { min, max } = CONNECTOR_LIMITS.width
  const v = round(Math.min(max, Math.max(min, value)))
  const size: Vec3 = axis === 'x' ? [v, p.size[1], p.size[2]] : [p.size[0], p.size[1], v]
  return { size: connectorSize({ ...p, size }, floors) }
}

/** Every connector in the design with its size refitted to the floors (after floor changes). */
export function refitConnectors(design: Design): Design {
  let changed = false
  const pieces = design.pieces.map((p) => {
    if (!isConnector(p)) return p
    const size = connectorSize(p, design.floors)
    if (size.every((v, i) => v === p.size[i])) return p
    changed = true
    return { ...p, size }
  })
  return changed ? { ...design, pieces } : design
}

/** The connector's footprint in plan as a convex polygon of world [x, z] points (counter-clockwise from above). */
export function connectorOutline(p: Pick<Piece, 'type' | 'position' | 'rotation' | 'size' | 'floor' | 'toFloor'>, floors: Floor[]): Plan[] {
  const [w, , d] = connectorSize(p, floors)
  const [cx, , cz] = p.position
  if (CONNECTORS[p.type as ConnectorType].round) {
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2
      return [round(cx + Math.cos(a) * (w / 2)), round(cz - Math.sin(a) * (w / 2))] as Plan
    })
  }
  const θ = p.rotation[1]
  const [c, s] = [Math.cos(θ), Math.sin(θ)]
  // Rotation about y, as Three.js turns the piece: x' = x cos + z sin, z' = -x sin + z cos.
  return ([[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]] as Plan[]).map(([x, z]) => [round(cx + x * c + z * s), round(cz - x * s + z * c)] as Plan)
}

/**
 * Holes on one floor, as plan polygons: in its floor slabs ('slab') where a connector comes up
 * through it, or in its ceilings ('ceiling') where one carries on up to a floor above.
 */
export function floorHoles(design: Pick<Design, 'pieces' | 'floors'>, floor: number, surface: 'slab' | 'ceiling'): Plan[][] {
  return design.pieces
    .filter((p) => {
      if (!isConnector(p)) return false
      const { from, to } = connectorFloors(p)
      return surface === 'slab' ? floor > from && floor <= to : floor >= from && floor < to
    })
    .map((p) => connectorOutline(p, design.floors))
}

/** Clips a convex polygon to a rectangle (Sutherland–Hodgman). */
export function clipToRect(poly: Plan[], r: Rect): Plan[] {
  const edges: [(p: Plan) => boolean, (a: Plan, b: Plan) => Plan][] = [
    [(p) => p[0] >= r.x0, (a, b) => lerpAt(a, b, 0, r.x0)],
    [(p) => p[0] <= r.x1, (a, b) => lerpAt(a, b, 0, r.x1)],
    [(p) => p[1] >= r.z0, (a, b) => lerpAt(a, b, 1, r.z0)],
    [(p) => p[1] <= r.z1, (a, b) => lerpAt(a, b, 1, r.z1)],
  ]
  let out = poly
  for (const [inside, cut] of edges) {
    const input = out
    out = []
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length]
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur))
        out.push(cur)
      } else if (inside(prev)) out.push(cut(prev, cur))
    })
    if (out.length === 0) return []
  }
  return out
}

function lerpAt(a: Plan, b: Plan, axis: 0 | 1, value: number): Plan {
  const t = (value - a[axis]) / (b[axis] - a[axis])
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export const polygonArea = (poly: Plan[]) => Math.abs(poly.reduce((sum, p, i) => sum + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)) / 2

/** Convex hull (monotone chain). */
export function convexHull(points: Plan[]): Plan[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Plan, a: Plan, b: Plan) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Plan[]) => {
    const h: Plan[] = []
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop()
      h.push(p)
    }
    return h.slice(0, -1)
  }
  return [...half(pts), ...half([...pts].reverse())]
}

const bounds = (poly: Plan[]) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), z0: Math.min(...poly.map((p) => p[1])), z1: Math.max(...poly.map((p) => p[1])) })

/**
 * The holes to cut in one rectangular slab or ceiling: each clipped to just inside the
 * rectangle (a millimetre in, so the outline stays whole), and holes that overlap merged into
 * their hull, so the triangulator never sees crossing holes.
 */
export function holesInRect(rect: Rect, holes: Plan[][]): Plan[][] {
  const inset = 0.001
  const inner = { x0: rect.x0 + inset, z0: rect.z0 + inset, x1: rect.x1 - inset, z1: rect.z1 - inset }
  let out = holes.map((h) => clipToRect(h, inner)).filter((h) => h.length >= 3 && polygonArea(h) > 1e-4)
  for (let merged = true; merged; ) {
    merged = false
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const [a, b] = [bounds(out[i]), bounds(out[j])]
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) {
          out = [...out.filter((_, k) => k !== i && k !== j), convexHull([...out[i], ...out[j]])]
          merged = true
          break outer
        }
      }
    }
  }
  return out
}
