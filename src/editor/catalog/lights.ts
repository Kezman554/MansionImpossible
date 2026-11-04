// Lights and sky: scene data (DESIGN.md: the palette is for the chrome, never the scene).
import type { LightType } from '../../types/design'

export interface LightSpec {
  label: string
  /** Default intensity, in Three.js units (candela for point and spot lights; the sun is about 2). */
  intensity: number
  /** Mounted under the ceiling (true) or standing on the floor (false). */
  ceiling: boolean
  /** Palette icon, an outline in a 24-unit box. */
  icon: string
}

export const LIGHT_TYPES: LightType[] = ['ceiling', 'lamp', 'spot', 'strip']

export const LIGHTS: Record<LightType, LightSpec> = {
  ceiling: { label: 'Ceiling light', intensity: 8, ceiling: true, icon: 'M4 6h16M8 6a4 4 0 0 0 8 0M12 13v2M7 12l-1.5 1.5M17 12l1.5 1.5' },
  lamp: { label: 'Lamp', intensity: 4, ceiling: false, icon: 'M8 4h8l3 7H5zM12 11v9M8 20h8' },
  spot: { label: 'Spotlight', intensity: 15, ceiling: true, icon: 'M4 4h16M10 4l-1 5h6l-1-5M9 9l-4 11M15 9l4 11' },
  strip: { label: 'Strip light', intensity: 5, ceiling: true, icon: 'M3 6h18v2H3zM5 12h.01M9 12h.01M13 12h.01M17 12h.01M21 12h.01' },
}

/** Colour presets offered beside the colour picker. */
export const LIGHT_COLOURS: { label: string; color: string }[] = [
  { label: 'Warm white', color: '#FFD6A5' },
  { label: 'Neutral white', color: '#FFF1DE' },
  { label: 'Cool white', color: '#DCE9FF' },
  { label: 'Candle', color: '#FFB46B' },
  { label: 'Rose', color: '#FF9FB2' },
  { label: 'Aqua', color: '#7FE3E0' },
]
export const DEFAULT_LIGHT_COLOUR = LIGHT_COLOURS[0].color

export const LIGHT_LIMITS = { intensity: { min: 0, max: 100 }, length: { min: 0.3, max: 12 }, angle: { min: 0.1, max: 1.3 } } as const

/**
 * Sky colour through the day: [hour, #rrggbb], interpolated; 0 and 24 are the same night. Dawn
 * and dusk go through golden keys so blue never fades to orange through grey.
 */
export const SKY_KEYS: [number, string][] = [
  [0, '#0A1328'],
  [4.5, '#111C38'],
  [5.5, '#3A3560'],
  [6.1, '#D98E6E'],
  [6.8, '#EDBB8F'],
  [7.6, '#A9CBE6'],
  [12, '#86BDE8'],
  [16.8, '#9CC4E6'],
  [17.6, '#E9C79A'],
  [18.3, '#E89562'],
  [19, '#B55E5A'],
  [19.6, '#4E3A63'],
  [20.4, '#1A2245'],
  [21.5, '#0A1328'],
  [24, '#0A1328'],
]

/** Light from the sky: ambient fill colours by day and by night, and moonlight. */
export const SKY_LIGHT = { day: '#FFFFFF', night: '#8EA2D8', sun: '#FFF4E0', lowSun: '#FFB980', moon: '#9DB0E8' } as const
