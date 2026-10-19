// App-wide preferences: they belong to this computer, not to any design.

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const
export type Quality = (typeof QUALITY_LEVELS)[number]

export interface AppSettings {
  quality: Quality
  showFps: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = { quality: 'medium', showFps: false }

/** Keeps only valid saved values, so a bad or old record can't break the app. */
export function withDefaults(saved: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
  return {
    quality: QUALITY_LEVELS.includes(saved.quality as Quality) ? (saved.quality as Quality) : DEFAULT_APP_SETTINGS.quality,
    showFps: typeof saved.showFps === 'boolean' ? saved.showFps : DEFAULT_APP_SETTINGS.showFps,
  }
}
