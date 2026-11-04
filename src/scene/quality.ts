import type { LightBudget } from '../editor/lights'
import type { Quality } from '../types/appSettings'

export interface QualityPreset {
  label: string
  /** Device pixel ratio is clamped to [1, maxPixelRatio]. */
  maxPixelRatio: number
  antialias: boolean
  /**
   * Shadow map for the one shadow-casting light; false = no shadows. Always PCF:
   * three r180+ removed PCFSoftShadowMap, so softness comes from radius instead.
   */
  shadows: false | { mapSize: number; radius: number }
  /**
   * Placed lights that are real lights (the rest still glow but light nothing), and whether the
   * one light asking for shadows gets them. With the sun that's two shadow casters at most.
   */
  lights: LightBudget
  /** Fish swimming in each floor's slice of the tank (fewer in a small tank). */
  fishPerFloor: number
}

// Low targets integrated laptop graphics at 60fps; higher levels trade frame rate for sharpness.
export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { label: 'Low', maxPixelRatio: 1, antialias: false, shadows: false, lights: { points: 6, spots: 2, shadowLights: 0, shadowMapSize: 0 }, fishPerFloor: 8 },
  medium: { label: 'Med', maxPixelRatio: 1.5, antialias: true, shadows: { mapSize: 1024, radius: 1 }, lights: { points: 12, spots: 4, shadowLights: 1, shadowMapSize: 512 }, fishPerFloor: 18 },
  high: { label: 'High', maxPixelRatio: 2, antialias: true, shadows: { mapSize: 2048, radius: 3 }, lights: { points: 24, spots: 8, shadowLights: 1, shadowMapSize: 1024 }, fishPerFloor: 36 },
}
