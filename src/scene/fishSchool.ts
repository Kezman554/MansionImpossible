// Boids for the tank's fish: each school swims inside one floor's slice of the tank. Fish keep
// apart (separation), turn with their own kind (alignment) and drift towards them (cohesion),
// wander a little, and are steered back from the glass, then held inside it. Plain typed
// arrays and a seeded random, so it's cheap, deterministic and testable without a renderer.
import { FISH, FISH_SPECIES, type FishSpecies } from '../editor/catalog/fish'
import type { FishTank, Floor } from '../types/design'

/** Where a school may swim: a box or a cylinder (the tank's footprint), between two heights. */
export type SchoolBounds =
  | { shape: 'box'; cx: number; cz: number; hx: number; hz: number; y0: number; y1: number }
  | { shape: 'cylinder'; cx: number; cz: number; r: number; y0: number; y1: number }

export interface School {
  count: number
  /** Species index into FISH_SPECIES, per fish. */
  species: Uint8Array
  /** Colour index into the species' colours, per fish. */
  colour: Uint8Array
  position: Float32Array
  velocity: Float32Array
  /** Tail-beat phase, per fish (radians). */
  phase: Float32Array
  /** Simulation steps taken: lets tests see a paused school stand still. */
  steps: number
}

/** Fish keep this far from the glass, floor and surface (metres; less in a small tank). */
export const WALL_MARGIN = 0.25
const NEIGHBOUR = 0.9
const SEPARATION = 0.28
const WEIGHTS = { separation: 1.6, alignment: 0.9, cohesion: 0.45, wander: 0.35, walls: 4 }
const MAX_DT = 0.05

function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const margin = (b: SchoolBounds) => Math.min(WALL_MARGIN, (b.shape === 'box' ? Math.min(b.hx, b.hz) : b.r) * 0.3, (b.y1 - b.y0) * 0.3)

/** A school of `count` fish spread through the bounds, species by their shares. */
export function createSchool(count: number, bounds: SchoolBounds, seed = 1): School {
  const rand = random(seed)
  const school: School = {
    count,
    species: new Uint8Array(count),
    colour: new Uint8Array(count),
    position: new Float32Array(count * 3),
    velocity: new Float32Array(count * 3),
    phase: new Float32Array(count),
    steps: 0,
  }
  const m = margin(bounds)
  for (let i = 0; i < count; i++) {
    // Species by share: walk the cumulative shares at this fish's place in the school.
    let at = (i + 0.5) / count
    let s = 0
    while (s < FISH_SPECIES.length - 1 && at > FISH[FISH_SPECIES[s]].share) at -= FISH[FISH_SPECIES[s++]].share
    school.species[i] = s
    school.colour[i] = Math.floor(rand() * FISH[FISH_SPECIES[s]].colours.length)
    const angle = rand() * Math.PI * 2
    const reach = Math.sqrt(rand())
    const [x, z] =
      bounds.shape === 'box'
        ? [bounds.cx + (rand() * 2 - 1) * (bounds.hx - m), bounds.cz + (rand() * 2 - 1) * (bounds.hz - m)]
        : [bounds.cx + Math.cos(angle) * reach * (bounds.r - m), bounds.cz + Math.sin(angle) * reach * (bounds.r - m)]
    school.position.set([x, bounds.y0 + m + rand() * Math.max(0, bounds.y1 - bounds.y0 - 2 * m), z], i * 3)
    const heading = rand() * Math.PI * 2
    const [lo, hi] = FISH[FISH_SPECIES[s]].speed
    const speed = lo + rand() * (hi - lo)
    school.velocity.set([Math.cos(heading) * speed, (rand() - 0.5) * 0.1, Math.sin(heading) * speed], i * 3)
    school.phase[i] = rand() * Math.PI * 2
  }
  return school
}

/** True if a point is inside the bounds (with `slack`). */
export function insideBounds(b: SchoolBounds, x: number, y: number, z: number, slack = 1e-4): boolean {
  if (y < b.y0 - slack || y > b.y1 + slack) return false
  if (b.shape === 'box') return Math.abs(x - b.cx) <= b.hx + slack && Math.abs(z - b.cz) <= b.hz + slack
  return Math.hypot(x - b.cx, z - b.cz) <= b.r + slack
}

/** Advances the school by dt seconds (capped, so a long frame can't throw fish through the glass). */
export function stepSchool(school: School, bounds: SchoolBounds, dt: number, seed = school.steps + 7): void {
  const step = Math.min(MAX_DT, Math.max(0, dt))
  if (step === 0 || school.count === 0) return
  const rand = random(seed)
  const { position: p, velocity: v, species, count } = school
  const m = margin(bounds)
  const ax = new Float32Array(count)
  const ay = new Float32Array(count)
  const az = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const [xi, yi, zi] = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]
    let [sx, sy, sz, vx, vy, vz, cx, cy, cz, n] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let j = 0; j < count; j++) {
      if (j === i) continue
      const [dx, dy, dz] = [xi - p[j * 3], yi - p[j * 3 + 1], zi - p[j * 3 + 2]]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > NEIGHBOUR * NEIGHBOUR) continue
      // Every fish keeps its distance; only its own kind school together.
      if (d2 < SEPARATION * SEPARATION && d2 > 1e-8) {
        sx += dx / d2
        sy += dy / d2
        sz += dz / d2
      }
      if (species[j] !== species[i]) continue
      vx += v[j * 3]
      vy += v[j * 3 + 1]
      vz += v[j * 3 + 2]
      cx += p[j * 3]
      cy += p[j * 3 + 1]
      cz += p[j * 3 + 2]
      n++
    }
    let [fx, fy, fz] = [sx * WEIGHTS.separation * 0.02, sy * WEIGHTS.separation * 0.02, sz * WEIGHTS.separation * 0.02]
    if (n > 0) {
      fx += (vx / n - v[i * 3]) * WEIGHTS.alignment + (cx / n - xi) * WEIGHTS.cohesion
      fy += (vy / n - v[i * 3 + 1]) * WEIGHTS.alignment + (cy / n - yi) * WEIGHTS.cohesion
      fz += (vz / n - v[i * 3 + 2]) * WEIGHTS.alignment + (cz / n - zi) * WEIGHTS.cohesion
    }
    fx += (rand() - 0.5) * WEIGHTS.wander
    fy += (rand() - 0.5) * WEIGHTS.wander * 0.3
    fz += (rand() - 0.5) * WEIGHTS.wander
    // Walls: push back in proportion to how far into the margin a fish has come.
    const push = (depth: number) => (depth > 0 ? (depth / m) * WEIGHTS.walls : 0)
    if (bounds.shape === 'box') {
      fx += push(xi - (bounds.cx + bounds.hx - m)) * -1 + push(bounds.cx - bounds.hx + m - xi)
      fz += push(zi - (bounds.cz + bounds.hz - m)) * -1 + push(bounds.cz - bounds.hz + m - zi)
    } else {
      const [rx, rz] = [xi - bounds.cx, zi - bounds.cz]
      const r = Math.hypot(rx, rz) || 1
      const k = push(r - (bounds.r - m))
      fx -= (rx / r) * k
      fz -= (rz / r) * k
    }
    fy += push(bounds.y0 + m - yi) - push(yi - (bounds.y1 - m))
    ax[i] = fx
    ay[i] = fy
    az[i] = fz
  }

  for (let i = 0; i < count; i++) {
    const [lo, hi] = FISH[FISH_SPECIES[species[i]] as FishSpecies].speed
    let [vx, vy, vz] = [v[i * 3] + ax[i] * step, (v[i * 3 + 1] + ay[i] * step) * 0.98, v[i * 3 + 2] + az[i] * step]
    // Fish swim mostly level: keep climbs gentle.
    vy = Math.max(-0.25, Math.min(0.25, vy))
    const speed = Math.hypot(vx, vy, vz) || 1e-6
    const clamped = Math.min(hi, Math.max(lo, speed))
    vx = (vx / speed) * clamped
    vy = (vy / speed) * clamped
    vz = (vz / speed) * clamped
    let [x, y, z] = [p[i * 3] + vx * step, p[i * 3 + 1] + vy * step, p[i * 3 + 2] + vz * step]
    // Hold inside the glass (the tank may have moved or shrunk): clamp and turn back.
    if (bounds.shape === 'box') {
      if (Math.abs(x - bounds.cx) > bounds.hx) {
        x = bounds.cx + Math.sign(x - bounds.cx) * bounds.hx
        vx = -vx
      }
      if (Math.abs(z - bounds.cz) > bounds.hz) {
        z = bounds.cz + Math.sign(z - bounds.cz) * bounds.hz
        vz = -vz
      }
    } else {
      const [rx, rz] = [x - bounds.cx, z - bounds.cz]
      const r = Math.hypot(rx, rz)
      if (r > bounds.r) {
        x = bounds.cx + (rx / r) * bounds.r
        z = bounds.cz + (rz / r) * bounds.r
        const out = (vx * rx + vz * rz) / r
        vx -= (2 * out * rx) / r
        vz -= (2 * out * rz) / r
      }
    }
    if (y < bounds.y0) {
      y = bounds.y0
      vy = Math.abs(vy)
    }
    if (y > bounds.y1) {
      y = bounds.y1
      vy = -Math.abs(vy)
    }
    p.set([x, y, z], i * 3)
    v.set([vx, vy, vz], i * 3)
    school.phase[i] += step * (4 + clamped * 10)
  }
  school.steps++
}

/** How aligned a school swims: 1 = all the same way, near 0 = every which way. */
export function polarisation(school: School): number {
  let [sx, sy, sz] = [0, 0, 0]
  for (let i = 0; i < school.count; i++) {
    const [vx, vy, vz] = [school.velocity[i * 3], school.velocity[i * 3 + 1], school.velocity[i * 3 + 2]]
    const s = Math.hypot(vx, vy, vz) || 1
    sx += vx / s
    sy += vy / s
    sz += vz / s
  }
  return school.count ? Math.hypot(sx, sy, sz) / school.count : 0
}

/** Fish stay this far inside the glass, and above the floor / below the next one (metres). */
const GLASS = 0.06
const BAND = 0.15

/** One floor's slice of the tank: the school there swims only inside it. */
export function floorBounds(tank: FishTank, floor: Pick<Floor, 'elevation' | 'height'>): SchoolBounds {
  const [cx, cz] = tank.position
  const y0 = floor.elevation + BAND
  const y1 = floor.elevation + Math.max(floor.height - BAND, BAND * 2)
  if (tank.shape === 'cylindrical') return { shape: 'cylinder', cx, cz, r: Math.max(0.1, tank.size[0] / 2 - GLASS), y0, y1 }
  return { shape: 'box', cx, cz, hx: Math.max(0.1, tank.size[0] / 2 - GLASS), hz: Math.max(0.1, tank.size[1] / 2 - GLASS), y0, y1 }
}

/** Fish in one floor's slice: the quality's number, fewer in a small tank (about 1.5 per m² of floor). */
export function fishCount(tank: FishTank, perFloor: number): number {
  const area = tank.shape === 'cylindrical' ? Math.PI * (tank.size[0] / 2) ** 2 : tank.size[0] * tank.size[1]
  return Math.min(perFloor, Math.max(2, Math.round(area * 1.5)))
}

/** Floors whose part of the tank is on screen: the active one, and those below while they're ghosted. */
export const fishFloorsShown = (floors: Floor[], active: number, below: 'ghost' | 'hide') => floors.filter((f) => f.index === active || (f.index < active && below === 'ghost'))

