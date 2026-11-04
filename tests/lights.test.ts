import { beforeEach, describe, expect, it } from 'vitest'
import { LIGHT_COLOURS, LIGHT_TYPES, LIGHTS, SKY_KEYS } from '../src/editor/catalog/lights'
import { MATERIALS } from '../src/editor/catalog/materials'
import { editorActionFor } from '../src/editor/editorShortcuts'
import { addFloor, floorContents, removeFloor } from '../src/editor/floors'
import { assignLights, CEILING_DROP, colourAt, duplicateLights, lightShown, newLight, poolSizes, setShadowLight, sunAt } from '../src/editor/lights'
import { QUALITY_PRESETS } from '../src/scene/quality'
import { parseDesign, serialiseDesign } from '../src/storage/designFile'
import { DEFAULT_TIME_OF_DAY, migrateDesign } from '../src/storage/migrateDesign'
import { createDesign, useDesignStore } from '../src/store/designStore'
import { DESIGN_SCHEMA_VERSION, type Design, type Light, type LightType } from '../src/types/design'

let n = 0
const light = (type: LightType, floor: number, x: number, z: number, over: Partial<Light> = {}): Light => ({
  ...(newLight(type, { id: 'f', index: floor, name: 'F', elevation: floor * 3, height: 3 }, { x, z }, 0.5) as Light),
  id: `l${n++}`,
  ...over,
})

describe('light catalogue', () => {
  it('offers ceiling lights, lamps, spotlights and strip lights, with colour presets', () => {
    expect(LIGHT_TYPES.map((t) => LIGHTS[t].label)).toEqual(['Ceiling light', 'Lamp', 'Spotlight', 'Strip light'])
    for (const c of LIGHT_COLOURS) expect(c.color).toMatch(/^#[0-9A-F]{6}$/i)
    expect(editorActionFor({ key: 'l', ctrlKey: false, metaKey: false, altKey: false, target: null })).toBe('light-tool')
  })

  it('restores full metalness now that metals have an environment to reflect', () => {
    expect([MATERIALS.gold.metalness, MATERIALS.chrome.metalness, MATERIALS.steel.metalness, MATERIALS.brass.metalness, MATERIALS.copper.metalness]).toEqual([0.9, 0.9, 0.6, 0.7, 0.8])
  })
})

describe('placing lights', () => {
  it('hangs ceiling, spot and strip lights under the ceiling and stands lamps on the floor', () => {
    const floor = { id: 'f', index: 1, name: 'First', elevation: 3, height: 4 }
    expect(newLight('ceiling', floor, { x: 1.2, z: -0.3 }, 0.5)).toMatchObject({ kind: 'light', floor: 1, position: [1, 4 - CEILING_DROP, -0.5], intensity: LIGHTS.ceiling.intensity, castShadow: false })
    expect(newLight('lamp', floor, { x: 0, z: 0 }, null).position[1]).toBe(0)
    expect(newLight('strip', floor, { x: 0, z: 0 }, null, '#7FE3E0')).toMatchObject({ color: '#7FE3E0', length: 2 })
  })

  it('lets one light at a time ask for shadows', () => {
    let d: Design = { ...createDesign('S'), lights: [light('ceiling', 0, 0, 0), light('spot', 0, 2, 0), light('lamp', 0, 4, 0)] }
    d = setShadowLight(d, d.lights[0].id, true)
    d = setShadowLight(d, d.lights[1].id, true)
    expect(d.lights.map((l) => l.castShadow)).toEqual([false, true, false])
    d = setShadowLight(d, d.lights[1].id, false)
    expect(d.lights.every((l) => !l.castShadow)).toBe(true)
  })

  it('duplicates one step along, without copying the shadow request', () => {
    const d: Design = { ...createDesign('D'), lights: [light('spot', 0, 1, 1, { castShadow: true })] }
    const { design, ids } = duplicateLights(d, [d.lights[0].id], [1, 0, 1])
    expect(design.lights).toHaveLength(2)
    expect(design.lights[1]).toMatchObject({ id: ids[0], position: [2, d.lights[0].position[1], 2], castShadow: false })
  })
})

describe('lights in the store', () => {
  beforeEach(() => useDesignStore.getState().loadDesign(createDesign('L')))

  it('adds, selects, moves, deletes and undoes lights like pieces — one undo step each', () => {
    const s = () => useDesignStore.getState()
    const id = s().addObject(newLight('lamp', s().design.floors[0], { x: 0, z: 0 }, 0.5))
    s().select(id)
    expect(s().selection).toEqual([id])
    s().updateObject(id, { position: [2, 0, 1] })
    expect(s().past.length).toBe(2)
    s().removeObjects(id)
    expect(s().design.lights).toHaveLength(0)
    s().undo()
    expect(s().design.lights[0].position).toEqual([2, 0, 1])
  })

  it('go with their floor when it is removed, and are counted in what it holds', () => {
    let d = addFloor(createDesign('F'), 'above').design
    d = { ...d, lights: [light('ceiling', 0, 0, 0), light('lamp', 1, 0, 0)] }
    expect(floorContents(d, 1)).toBe(1)
    d = removeFloor(d, 0)
    expect(d.lights.map((l) => l.floor)).toEqual([0])
  })
})

describe('quality and the light budget', () => {
  // 20 lights at night on the ground floor (the test scene), 4 on the floor above.
  const twenty = Array.from({ length: 20 }, (_, i) => light(LIGHT_TYPES[i % 4], 0, (i % 5) * 3, Math.floor(i / 5) * 3, { castShadow: i === 7 }))
  const above = Array.from({ length: 4 }, (_, i) => light('ceiling', 1, i, 0))

  it('never casts more than two shadows: the sun and at most one light', () => {
    for (const [q, p] of Object.entries(QUALITY_PRESETS)) {
      const casters = (p.shadows ? 1 : 0) + p.lights.shadowLights
      expect(casters, q).toBeLessThanOrEqual(2)
    }
    expect(QUALITY_PRESETS.low.lights.shadowLights).toBe(0)
  })

  it('hands out the quality’s pool: active floor first, nearest the camera, floors above off', () => {
    for (const [q, p] of Object.entries(QUALITY_PRESETS)) {
      const a = assignLights([...twenty, ...above], 0, { x: 0, z: 0 }, p.lights)
      expect(a.points.length, q).toBeLessThanOrEqual(p.lights.points)
      expect(a.spots.length, q).toBeLessThanOrEqual(p.lights.spots)
      expect([...a.points, ...a.spots].every((l) => l.floor === 0), q).toBe(true)
      expect(a.shadow?.castShadow ?? false, q).toBe(p.lights.shadowLights === 1)
    }
    const low = assignLights(twenty, 0, { x: 0, z: 0 }, QUALITY_PRESETS.low.lights)
    expect(low.points.length + low.spots.length).toBe(8)
    const dist = (l: Light) => Math.hypot(l.position[0], l.position[2])
    expect(Math.max(...low.points.map(dist))).toBeLessThanOrEqual(Math.min(...twenty.filter((l) => l.type !== 'spot' && !low.points.includes(l)).map(dist)))
    expect(above.every((l) => !lightShown(l, 0))).toBe(true)
    // From the floor above, the ground floor's lights still count, after its own.
    const fromAbove = assignLights([...twenty, ...above], 1, { x: 0, z: 0 }, QUALITY_PRESETS.high.lights)
    expect(fromAbove.points.slice(0, 4).every((l) => l.floor === 1)).toBe(true)
  })
})

describe('pool sizes', () => {
  it('carries no lights for a design without lights, and grows in steps of four up to the budget', () => {
    const med = QUALITY_PRESETS.medium.lights
    expect(poolSizes([], med)).toMatchObject({ points: 0, spots: 0, shadowLights: 0 })
    expect(poolSizes([light('ceiling', 0, 0, 0)], med)).toMatchObject({ points: 4, spots: 0, shadowLights: 0 })
    const five = Array.from({ length: 5 }, (_, i) => light('lamp', 0, i, 0))
    expect(poolSizes(five, med).points).toBe(8)
    expect(poolSizes([...five, ...five, ...five], med).points).toBe(12)
    expect(poolSizes([light('spot', 0, 0, 0, { castShadow: true })], med)).toMatchObject({ spots: 4, shadowLights: 1 })
    expect(poolSizes([light('spot', 0, 0, 0, { castShadow: true })], QUALITY_PRESETS.low.lights).shadowLights).toBe(0)
    expect(poolSizes([light('lamp', 0, 0, 0, { intensity: 0 })], med).points).toBe(0)
  })
})

describe('time of day', () => {
  it('moves the sun: up at noon, down at midnight, on the horizon at 6 and 18', () => {
    expect(sunAt(12).height).toBeGreaterThan(0.8)
    expect(sunAt(12).daylight).toBe(1)
    expect(sunAt(0).height).toBeLessThan(0)
    expect(sunAt(22).daylight).toBe(0)
    expect(Math.abs(sunAt(6).height)).toBeLessThan(0.01)
    expect(sunAt(8).direction[0]).toBeGreaterThan(0) // morning: east
    expect(sunAt(16).direction[0]).toBeLessThan(0) // afternoon: west
  })

  it('changes the sky colour, wrapping at midnight', () => {
    expect(colourAt(SKY_KEYS, 0)).toBe(colourAt(SKY_KEYS, 24))
    expect(colourAt(SKY_KEYS, 12)).toBe(SKY_KEYS.find(([h]) => h === 12)![1].toLowerCase())
    expect(colourAt(SKY_KEYS, 12)).not.toBe(colourAt(SKY_KEYS, 22))
    expect(colourAt(SKY_KEYS, 9.75)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('save format v6', () => {
  it('upgrades a v5 design: no lights, the default time of day', () => {
    const v5 = { ...createDesign('Old'), version: 5, lights: undefined, settings: { gridSize: 0.5, snapToGrid: true, timeOfDay: 7 } }
    const up = parseDesign(JSON.stringify(v5))
    expect(up.version).toBe(DESIGN_SCHEMA_VERSION)
    expect(DESIGN_SCHEMA_VERSION).toBe(6)
    expect(up.lights).toEqual([])
    expect(up.settings.timeOfDay).toBe(DEFAULT_TIME_OF_DAY)
    expect(migrateDesign({ ...v5 } as never).lights).toEqual([])
  })

  it('round-trips lights and the time of day; rejects a light without a colour', () => {
    const d: Design = { ...createDesign('R'), lights: [light('spot', 0, 1, 1)], settings: { ...createDesign('R').settings, timeOfDay: 21.5 } }
    expect(parseDesign(serialiseDesign(d))).toEqual(d)
    expect(() => parseDesign(serialiseDesign({ ...d, lights: [{ ...d.lights[0], color: 'warm' }] }))).toThrow('lights[0]')
  })
})
