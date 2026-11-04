// Lights: placing, duplicating, the one-shadow rule, the per-quality budget, and the sun.
// Pure functions over plain data, so they're testable without a renderer.
import type { NewObject } from '../store/designStore'
import { newId } from '../store/designStore'
import type { Design, Floor, Light, LightType, Vec3 } from '../types/design'
import { DEFAULT_LIGHT_COLOUR, LIGHTS } from './catalog/lights'

/** Ceiling-mounted lights hang this far under the ceiling, in metres. */
export const CEILING_DROP = 0.06
const round = (v: number) => Math.round(v * 1000) / 1000

/** A new light at (x, z) on a floor: lamps stand on it, the rest hang under its ceiling. */
export function newLight(type: LightType, floor: Floor | undefined, at: { x: number; z: number }, snap: number | null, color = DEFAULT_LIGHT_COLOUR): NewObject {
  const place = (v: number) => (snap ? round(Math.round(v / snap) * snap) : round(v))
  const y = LIGHTS[type].ceiling ? round((floor?.height ?? 3) - CEILING_DROP) : 0
  return {
    kind: 'light',
    type,
    floor: floor?.index ?? 0,
    position: [place(at.x), y, place(at.z)],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color,
    intensity: LIGHTS[type].intensity,
    length: 2,
    angle: 0.5,
    castShadow: false,
  }
}

/** Sets which light asks for shadows: at most one in the design, so turning one on turns the others off. */
export function setShadowLight(design: Design, id: string, on: boolean): Design {
  return { ...design, lights: design.lights.map((l) => (l.id === id ? { ...l, castShadow: on } : on && l.castShadow ? { ...l, castShadow: false } : l)) }
}

/** Copies lights one grid step along (the same offset as pieces); one undo step with the caller's applyDesign. */
export function duplicateLights(design: Design, ids: string[], offset: Vec3): { design: Design; ids: string[] } {
  const copies = design.lights.filter((l) => ids.includes(l.id)).map((l): Light => ({ ...l, id: newId(), castShadow: false, position: l.position.map((v, i) => round(v + offset[i])) as Vec3 }))
  return { design: { ...design, lights: [...design.lights, ...copies] }, ids: copies.map((c) => c.id) }
}

/** How many real lights each quality runs, and whether one placed light may cast shadows. */
export interface LightBudget {
  /** Non-shadow point lights (ceiling lights, lamps, strips). */
  points: number
  /** Non-shadow spotlights. */
  spots: number
  /** 1: the light asking for shadows gets a shadow-casting spot (with the sun, two casters at most). */
  shadowLights: 0 | 1
  shadowMapSize: number
}

/**
 * Lights that are on and which pool slot each gets. Lights on floors above the one being edited
 * are hidden and off (like the floors). The rest go by priority — the active floor first, then
 * nearest to `focus` (the camera's target) — until the quality's pools are full. Fixed pool sizes
 * mean adding or removing lights never changes the shader programs (no recompile hitch).
 */
export function assignLights(lights: Light[], activeFloor: number, focus: { x: number; z: number }, budget: LightBudget): { shadow: Light | null; points: Light[]; spots: Light[] } {
  const candidates = lights
    .filter((l) => l.floor <= activeFloor && l.intensity > 0)
    .map((l) => ({ l, key: (l.floor === activeFloor ? 0 : 1e6) + Math.hypot(l.position[0] - focus.x, l.position[2] - focus.z) }))
    .sort((a, b) => a.key - b.key)
    .map((c) => c.l)
  const shadow = budget.shadowLights ? (candidates.find((l) => l.castShadow) ?? null) : null
  const rest = candidates.filter((l) => l !== shadow)
  return {
    shadow,
    points: rest.filter((l) => l.type !== 'spot').slice(0, budget.points),
    spots: rest.filter((l) => l.type === 'spot').slice(0, budget.spots),
  }
}

/** Pool slots grow in steps of this many, so shaders recompile only when a step is crossed. */
export const POOL_STEP = 4

/**
 * The pool sizes to run for the lights shown: enough slots for them in steps of POOL_STEP, never
 * more than the quality allows. No lights, no pool — a design without lights costs nothing extra.
 * The shadow slot exists only while a shown light asks for shadows and the quality allows it.
 */
export function poolSizes(shown: Light[], budget: LightBudget): LightBudget {
  const step = (n: number, max: number) => Math.min(max, Math.ceil(n / POOL_STEP) * POOL_STEP)
  const lit = shown.filter((l) => l.intensity > 0)
  return {
    ...budget,
    points: step(lit.filter((l) => l.type !== 'spot').length, budget.points),
    spots: step(lit.filter((l) => l.type === 'spot').length, budget.spots),
    shadowLights: budget.shadowLights && lit.some((l) => l.castShadow) ? 1 : 0,
  }
}

/** Visible: on the active floor or below it (floors above are hidden). */
export const lightShown = (l: Pick<Light, 'floor'>, activeFloor: number) => l.floor <= activeFloor

export interface Sun {
  /** Unit vector towards the sun (y up). */
  direction: Vec3
  /** 0 at night, 1 in full day; eases through dawn and dusk. */
  daylight: number
  /** Height of the sun: sine of its elevation (negative below the horizon). */
  height: number
}

/**
 * The sun at an hour: rises in the east (+x) at 06:00, highest (60°) at noon, sets in the west
 * at 18:00, swinging a little south (+z) at midday.
 */
export function sunAt(hour: number): Sun {
  const t = ((hour - 6) / 12) * Math.PI // 0 at sunrise, π at sunset
  const height = Math.sin(t) * Math.sin((60 * Math.PI) / 180)
  const across = Math.cos(t)
  const south = 0.35 * Math.max(0, Math.sin(t))
  const len = Math.hypot(across, height, south) || 1
  const daylight = Math.min(1, Math.max(0, (height + 0.05) / 0.3))
  return { direction: [across / len, height / len, south / len], daylight: daylight * daylight * (3 - 2 * daylight), height }
}

/** Interpolates a list of [hour, #rrggbb] keys (sky colours) at an hour, in sRGB. */
export function colourAt(keys: [number, string][], hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const i = Math.max(0, keys.findIndex(([k], j) => h >= k && h <= keys[j + 1]?.[0]))
  const [[h0, c0], [h1, c1]] = [keys[i], keys[i + 1] ?? keys[i]]
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
  const channels = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))
  const [a, b] = [channels(c0), channels(c1)]
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
