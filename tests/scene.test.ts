import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { CAMERA_LIMITS, clampTarget } from '../src/scene/cameraLimits'
import { gridLines } from '../src/scene/gridLines'
import { QUALITY_PRESETS } from '../src/scene/quality'
import { QUALITY_LEVELS } from '../src/types/appSettings'

type Segment = { x1: number; z1: number; x2: number; z2: number }
const segments = (buffer: Float32Array): Segment[] => {
  const out: Segment[] = []
  for (let i = 0; i < buffer.length; i += 6) out.push({ x1: buffer[i], z1: buffer[i + 2], x2: buffer[i + 3], z2: buffer[i + 5] })
  return out
}
/** Distinct x positions of the lines running along z. */
const xs = (buffer: Float32Array) => [...new Set(segments(buffer).filter((s) => s.x1 === s.x2).map((s) => s.x1))].sort((a, b) => a - b)

describe('ground grid', () => {
  const { minor, major } = gridLines([40, 40])

  it('puts major lines every 10 m and minor lines every 1 m between them', () => {
    expect(xs(major)).toEqual([-20, -10, 0, 10, 20])
    expect(xs(minor)).toHaveLength(41 - 5)
    expect(xs(minor)).toContain(1)
    expect(xs(minor)).not.toContain(10)
  })

  it('covers the whole plot with unbroken lines, flat on the ground', () => {
    for (let i = 1; i < major.length; i += 3) expect(major[i]).toBe(0)
    // The pieces of the x = 0 line join end to end from z = -20 to z = 20.
    const pieces = segments(major).filter((s) => s.x1 === 0 && s.x2 === 0).sort((a, b) => a.z1 - b.z1)
    expect(pieces[0].z1).toBe(-20)
    expect(pieces.at(-1)!.z2).toBe(20)
    pieces.slice(1).forEach((p, i) => expect(p.z1).toBe(pieces[i].z2))
  })

  it('splits lines into pieces no longer than a major cell', () => {
    for (const s of [...segments(minor), ...segments(major)]) expect(Math.hypot(s.x2 - s.x1, s.z2 - s.z1)).toBeLessThanOrEqual(10)
  })
})

describe('camera limits', () => {
  it('keeps the orbit target over the plot and reports how far it moved', () => {
    const target = new Vector3(150, 0, -30)
    const moved = clampTarget(target, [200, 200])
    expect(target.toArray()).toEqual([100, 0, -30])
    expect(moved.toArray()).toEqual([-50, 0, 0])
  })

  it('clamps target height and leaves an in-bounds target alone', () => {
    const high = new Vector3(0, 500, 0)
    clampTarget(high, [200, 200])
    expect(high.y).toBe(CAMERA_LIMITS.maxTargetY)

    const inside = new Vector3(5, 3, -5)
    expect(clampTarget(inside, [200, 200]).lengthSq()).toBe(0)
  })

  it('never lets the camera reach the horizon or zoom without limit', () => {
    expect(CAMERA_LIMITS.maxPolarAngle).toBeLessThan(Math.PI / 2)
    expect(CAMERA_LIMITS.minDistance).toBeGreaterThan(0)
    expect(Number.isFinite(CAMERA_LIMITS.maxDistance)).toBe(true)
  })
})

describe('quality presets', () => {
  it('get sharper and heavier from low to high', () => {
    const [low, medium, high] = QUALITY_LEVELS.map((q) => QUALITY_PRESETS[q])
    expect(low).toMatchObject({ maxPixelRatio: 1, antialias: false, shadows: false })
    expect(medium.maxPixelRatio).toBeLessThan(high.maxPixelRatio)
    expect(medium.antialias && high.antialias).toBe(true)
    expect(medium.shadows && high.shadows && medium.shadows.mapSize < high.shadows.mapSize).toBe(true)
  })
})
