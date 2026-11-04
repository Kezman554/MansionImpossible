// Low-poly geometry for vertical connectors, built for each one's fitted size (they can't share
// a unit geometry: step counts and turns change with height). Local space: origin at the middle
// of the base, y up, and "up" runs north (-z): straight stairs climb towards -z and straight
// slides drop towards +z. Parts are grouped by material, so each connector is a few draw calls.
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { worldUVs } from '../../scene/worldUV'
import type { Vec3 } from '../../types/design'
import type { ConnectorType } from './catalog'
import { SLIDE_RUNOUT, stepCount, STEP_GOING } from './connectors'

export interface ConnectorPart {
  /** Material id from the materials catalogue. */
  material: string
  geometry: BufferGeometry
  /** Thin surfaces seen from both sides (slide chutes). */
  doubleSided: boolean
}

type Point = [number, number, number]

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z)

/** A strip of quads between two matching rows of points. */
function ribbon(a: Point[], b: Point[]): BufferGeometry {
  const positions: number[] = []
  for (let i = 0; i < a.length - 1; i++) positions.push(...a[i], ...b[i], ...a[i + 1], ...a[i + 1], ...b[i], ...b[i + 1])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.computeVertexNormals()
  return g
}

/**
 * A slide chute swept along a path: a floor between two edges with a wall up from each. At each
 * path point, `side` is the horizontal unit vector across the chute.
 */
function chute(path: { p: Point; side: [number, number] }[], inner: number, outer: number, wallIn: number, wallOut: number): BufferGeometry[] {
  const at = (q: (typeof path)[number], d: number, up = 0): Point => [q.p[0] + q.side[0] * d, q.p[1] + up, q.p[2] + q.side[1] * d]
  const a = path.map((q) => at(q, inner))
  const b = path.map((q) => at(q, outer))
  return [ribbon(a, b), ribbon(path.map((q) => at(q, inner, wallIn)), a), ribbon(b, path.map((q) => at(q, outer, wallOut)))]
}

function straightStairs(w: number, h: number, run: number, material: string): ConnectorPart[] {
  const n = stepCount(h)
  const riser = h / n
  const parts: BufferGeometry[] = []
  // Floating treads; the last riser arrives at the floor above, which is the top step.
  for (let i = 0; i < n - 1; i++) parts.push(box(w - 0.12, 0.05, STEP_GOING + 0.03, 0, (i + 1) * riser - 0.025, run / 2 - (i + 0.5) * STEP_GOING))
  const length = Math.hypot(run, h)
  const slope = Math.atan2(h, run)
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) parts.push(new BoxGeometry(0.06, 0.28, length).rotateX(slope).translate(x, h / 2, 0))
  return [{ material, geometry: merge(parts), doubleSided: false }]
}

function spiralStairs(d: number, h: number, material: string): ConnectorPart[] {
  const n = stepCount(h)
  const riser = h / n
  const r = d / 2
  const turn = (30 * Math.PI) / 180
  const treads: BufferGeometry[] = []
  const tip = 2 * r * Math.sin(turn / 2) + 0.06
  for (let i = 0; i < n; i++) {
    const length = r - 0.12
    treads.push(new BoxGeometry(length, 0.05, tip).translate(0.1 + length / 2, (i + 1) * riser - 0.025, 0).rotateY(-i * turn))
  }
  return [
    { material, geometry: merge(treads), doubleSided: false },
    { material: 'steel', geometry: new CylinderGeometry(0.1, 0.1, h, 12).translate(0, h / 2, 0), doubleSided: false },
  ]
}

function elevator(w: number, h: number, d: number, material: string): ConnectorPart[] {
  const post = 0.1
  const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(post, h, post, sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2))))
  const glass = [
    box(w - 2 * post, h, 0.02, 0, h / 2, -d / 2 + post / 2),
    box(w - 2 * post, h, 0.02, 0, h / 2, d / 2 - post / 2),
    box(0.02, h, d - 2 * post, -w / 2 + post / 2, h / 2, 0),
    box(0.02, h, d - 2 * post, w / 2 - post / 2, h / 2, 0),
  ]
  // The car waits at the bottom floor.
  const car = box(Math.max(0.2, w - 0.35), Math.min(2.4, h - 0.1), Math.max(0.2, d - 0.35), 0, 0.05 + Math.min(2.4, h - 0.1) / 2, 0)
  return [
    { material, geometry: merge(posts), doubleSided: false },
    { material: 'glass', geometry: merge(glass), doubleSided: false },
    { material: 'brass', geometry: car, doubleSided: false },
  ]
}

function spiralSlide(d: number, h: number, material: string): ConnectorPart[] {
  const r = d / 2
  const inner = 0.3
  const outer = Math.max(inner + 0.3, r - 0.05)
  const turns = Math.max(1, h / 2.8)
  const steps = Math.ceil(36 * turns)
  const exit = 0.35
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const θ = t * turns * Math.PI * 2
    const side: [number, number] = [Math.cos(θ), Math.sin(θ)]
    return { p: [0, h - (h - exit) * t, 0] as Point, side }
  })
  return [
    { material, geometry: merge(chute(path, inner, outer, 0.15, 0.4)), doubleSided: true },
    { material: 'steel', geometry: new CylinderGeometry(inner * 0.6, inner * 0.6, h + 0.6, 12).translate(0, (h + 0.6) / 2, 0), doubleSided: false },
  ]
}

function straightSlide(w: number, h: number, run: number, material: string): ConnectorPart[] {
  const exit = 0.35
  const slope = run - SLIDE_RUNOUT
  const steps = 12
  const path: { p: Point; side: [number, number] }[] = []
  // Straight down the slope from the floor above, then flat along the run-out.
  for (let i = 0; i <= steps; i++) path.push({ p: [0, h - (h - exit) * (i / steps), -run / 2 + slope * (i / steps)], side: [1, 0] })
  path.push({ p: [0, exit, run / 2], side: [1, 0] })
  const legs: BufferGeometry[] = []
  for (const q of path.filter((_, i) => i % 4 === 0 && i > 0)) for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) legs.push(box(0.06, q.p[1], 0.06, x, q.p[1] / 2, q.p[2]))
  return [
    { material, geometry: merge(chute(path, -w / 2, w / 2, 0.3, 0.3)), doubleSided: true },
    { material: 'steel', geometry: merge(legs), doubleSided: false },
  ]
}

function firemansPole(h: number, material: string): ConnectorPart[] {
  return [
    { material, geometry: new CylinderGeometry(0.05, 0.05, h, 12).translate(0, h / 2, 0), doubleSided: false },
    { material: 'steel', geometry: new CylinderGeometry(0.45, 0.45, 0.04, 20).translate(0, 0.02, 0), doubleSided: false },
  ]
}

/** Strips uv and index so boxes, cylinders and ribbons merge into one geometry. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const plain = parts.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g
    flat.deleteAttribute('uv')
    if (flat !== g) g.dispose()
    return flat
  })
  const merged = plain.length === 1 ? plain[0] : mergeGeometries(plain)
  if (plain.length > 1) plain.forEach((g) => g.dispose())
  return merged
}

/** The parts of one connector at its fitted size [width, height, depth or run]. The caller disposes them. */
export function connectorParts(type: ConnectorType, size: Vec3, material: string): ConnectorPart[] {
  const parts = build(type, size, material)
  for (const { geometry } of parts) {
    // Metres across each face, so textured materials tile at their real size.
    worldUVs(geometry)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return parts
}

function build(type: ConnectorType, size: Vec3, material: string): ConnectorPart[] {
  const [w, h, d] = size
  switch (type) {
    case 'stairs':
      return straightStairs(w, h, d, material)
    case 'spiral-stairs':
      return spiralStairs(w, h, material)
    case 'elevator':
      return elevator(w, h, d, material)
    case 'spiral-slide':
      return spiralSlide(w, h, material)
    case 'slide':
      return straightSlide(w, h, d, material)
    case 'fireman-pole':
      return firemansPole(h, material)
  }
}
