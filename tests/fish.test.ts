import { describe, expect, it } from 'vitest'
import { FISH, FISH_SPECIES } from '../src/editor/catalog/fish'
import { resolveMaterial } from '../src/editor/catalog/materials'
import { createSchool, fishCount, fishFloorsShown, floorBounds, insideBounds, stepSchool, type School, type SchoolBounds } from '../src/scene/fishSchool'
import { fishGeometry } from '../src/scene/fishModels'
import { QUALITY_PRESETS } from '../src/scene/quality'
import type { FishTank, Floor } from '../src/types/design'

const box: SchoolBounds = { shape: 'box', cx: 0, cz: 0, hx: 1.94, hz: 1.94, y0: 0.15, y1: 2.85 }
const cylinder: SchoolBounds = { shape: 'cylinder', cx: 5, cz: -2, r: 1.44, y0: 3.15, y1: 5.85 }
const run = (s: School, b: SchoolBounds, steps: number) => {
  for (let i = 0; i < steps; i++) stepSchool(s, b, 1 / 60)
}
const allInside = (s: School, b: SchoolBounds) => Array.from({ length: s.count }, (_, i) => insideBounds(b, s.position[i * 3], s.position[i * 3 + 1], s.position[i * 3 + 2])).every(Boolean)
/**
 * Local alignment: the average heading agreement (cosine) between each fish and its own kind
 * within 0.9 m — what schooling looks like. (Whole-school polarisation stays low in a tank: the
 * fish form several shoals and keep turning at the glass.)
 */
function localAlignment(s: School): number {
  let [sum, n] = [0, 0]
  const v = (i: number) => [s.velocity[i * 3], s.velocity[i * 3 + 1], s.velocity[i * 3 + 2]]
  for (let i = 0; i < s.count; i++)
    for (let j = 0; j < s.count; j++) {
      if (i === j || s.species[i] !== s.species[j]) continue
      if (Math.hypot(s.position[i * 3] - s.position[j * 3], s.position[i * 3 + 1] - s.position[j * 3 + 1], s.position[i * 3 + 2] - s.position[j * 3 + 2]) > 0.9) continue
      const [a, b] = [v(i), v(j)]
      sum += (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))
      n++
    }
  return n ? sum / n : 0
}

describe('fish models', () => {
  it('are tinted from the one materials catalogue (hidden from the paint picker)', () => {
    for (const species of FISH_SPECIES) for (const id of FISH[species].colours) expect(resolveMaterial(id)?.hidden, id).toBe(true)
  })

  it('builds a low-poly model per species at its size, nose along +x', () => {
    for (const species of FISH_SPECIES) {
      const g = fishGeometry(species)
      g.computeBoundingBox()
      const bb = g.boundingBox!
      expect(g.getAttribute('position').count, species).toBeLessThanOrEqual(60) // a few dozen triangles at most
      expect(bb.max.x, species).toBeCloseTo(FISH[species].size[0] / 2, 3)
      expect(bb.max.x - bb.min.x, species).toBeLessThan(FISH[species].size[0] * 1.2)
      expect(fishGeometry(species)).toBe(g) // shared by every fish of the kind
    }
  })
})

describe('schooling', () => {
  it('spreads a school through the bounds, species by share, the same every time for a seed', () => {
    const s = createSchool(36, box, 3)
    expect(allInside(s, box)).toBe(true)
    const counts = FISH_SPECIES.map((_, k) => s.species.filter((x) => x === k).length)
    expect(counts).toEqual([22, 9, 5])
    expect(createSchool(36, box, 3).position).toEqual(s.position)
  })

  it('keeps every fish inside the glass, floor and surface: box and cylinder, a minute of swimming', () => {
    for (const b of [box, cylinder]) {
      const s = createSchool(36, b, 11)
      for (let t = 0; t < 60; t++) {
        run(s, b, 60)
        expect(allInside(s, b), `${b.shape} at ${t + 1} s`).toBe(true)
      }
    }
  })

  it('swims at each species’ speed', () => {
    const s = createSchool(24, box, 5)
    run(s, box, 300)
    for (let i = 0; i < s.count; i++) {
      const [lo, hi] = FISH[FISH_SPECIES[s.species[i]]].speed
      const v = Math.hypot(s.velocity[i * 3], s.velocity[i * 3 + 1], s.velocity[i * 3 + 2])
      expect(v).toBeGreaterThanOrEqual(lo - 1e-3)
      expect(v).toBeLessThanOrEqual(hi + 1e-3)
    }
  })

  it('schools: fish of a kind turn to swim with their neighbours, and keep their distance', () => {
    for (const b of [box, { shape: 'box', cx: 0, cz: 0, hx: 3, hz: 3, y0: 0.2, y1: 2.8 } as SchoolBounds]) {
      const s = createSchool(30, b, 21)
      const before = localAlignment(s)
      run(s, b, 300) // settle for 5 s
      const samples: number[] = []
      for (let t = 0; t < 15; t++) {
        run(s, b, 60)
        samples.push(localAlignment(s))
      }
      const mean = samples.reduce((x, y) => x + y, 0) / samples.length
      expect(before).toBeLessThan(0.3)
      expect(mean).toBeGreaterThan(0.6)
      let nearest = Infinity
      for (let i = 0; i < s.count; i++)
        for (let j = i + 1; j < s.count; j++) nearest = Math.min(nearest, Math.hypot(s.position[i * 3] - s.position[j * 3], s.position[i * 3 + 1] - s.position[j * 3 + 1], s.position[i * 3 + 2] - s.position[j * 3 + 2]))
      expect(nearest).toBeGreaterThan(0.02)
    }
  })

  it('brings fish back inside when the tank moves, and a long frame can’t throw them through the glass', () => {
    const s = createSchool(20, box, 9)
    const moved: SchoolBounds = { ...box, cx: 1.5 }
    stepSchool(s, moved, 1)
    expect(allInside(s, moved)).toBe(true)
  })

  it('a school that isn’t stepped stands still (paused)', () => {
    const s = createSchool(10, box, 4)
    const before = Float32Array.from(s.position)
    expect(s.steps).toBe(0)
    stepSchool(s, box, 0)
    expect(s.position).toEqual(before)
  })
})

describe('fish in the tank', () => {
  const tank: FishTank = { id: 't', shape: 'rectangular', position: [0, 0], size: [4, 4] }
  const floors: Floor[] = [-1, 0, 1, 2].map((index) => ({ id: `f${index}`, index, name: `F${index}`, elevation: index * 3, height: 3 }))

  it('scale with quality, fewer in a small tank', () => {
    const [low, med, high] = (['low', 'medium', 'high'] as const).map((q) => fishCount(tank, QUALITY_PRESETS[q].fishPerFloor))
    expect(low).toBeLessThan(med)
    expect(med).toBeLessThan(high)
    expect(fishCount({ ...tank, size: [1, 1] }, QUALITY_PRESETS.high.fishPerFloor)).toBe(2)
  })

  it('swim in each floor’s slice of the tank', () => {
    const b = floorBounds(tank, floors[2])
    expect(b).toMatchObject({ shape: 'box', y0: 3.15, y1: 5.85 })
    expect(floorBounds({ ...tank, shape: 'cylindrical' }, floors[0])).toMatchObject({ shape: 'cylinder', r: 1.94 })
  })

  it('follow the floors: a floor made lower squeezes its school back inside at the next step', () => {
    const tall = floorBounds(tank, { elevation: 0, height: 5 })
    const s = createSchool(24, tall, 2)
    const low = floorBounds(tank, { elevation: 0, height: 2.4 })
    stepSchool(s, low, 1 / 60)
    expect(allInside(s, low)).toBe(true)
  })

  it('swim only on floors on screen: floors above are hidden, floors below only while ghosted', () => {
    expect(fishFloorsShown(floors, 1, 'ghost').map((f) => f.index)).toEqual([-1, 0, 1])
    expect(fishFloorsShown(floors, 1, 'hide').map((f) => f.index)).toEqual([1])
    expect(fishFloorsShown(floors, -1, 'ghost').map((f) => f.index)).toEqual([-1])
  })
})
