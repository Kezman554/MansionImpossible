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
}

// Low targets integrated laptop graphics at 60fps; higher levels trade frame rate for sharpness.
export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { label: 'Low', maxPixelRatio: 1, antialias: false, shadows: false },
  medium: { label: 'Med', maxPixelRatio: 1.5, antialias: true, shadows: { mapSize: 1024, radius: 1 } },
  high: { label: 'High', maxPixelRatio: 2, antialias: true, shadows: { mapSize: 2048, radius: 3 } },
}
