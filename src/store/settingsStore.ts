import { create } from 'zustand'
import { loadAppSettings, saveAppSettings } from '../storage/designDb'
import { DEFAULT_APP_SETTINGS, withDefaults, type AppSettings } from '../types/appSettings'
import { useAppStore } from './appStore'

interface SettingsState extends AppSettings {
  loaded: boolean
  /** Reads saved settings once at start-up; falls back to defaults if storage can't be read. */
  load: () => Promise<void>
  update: (changes: Partial<AppSettings>) => void
}

/** The banner's retry while a settings save is failing, so success clears only that banner. */
let failedRetry: (() => void) | null = null

function persist(settings: AppSettings): void {
  saveAppSettings(settings).then(
    () => {
      const app = useAppStore.getState()
      if (failedRetry && app.saveProblem?.retry === failedRetry) app.clearSaveProblem()
      failedRetry = null
    },
    (error) => {
      failedRetry = () => persist(settings)
      useAppStore.getState().reportSaveProblem(error, null, failedRetry)
    },
  )
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULT_APP_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      set({ ...withDefaults(await loadAppSettings()), loaded: true })
    } catch (error) {
      console.error('Could not read settings', error)
      set({ loaded: true })
    }
  },

  update: (changes) => {
    set(changes)
    const { quality, showFps } = get()
    persist({ quality, showFps })
  },
}))
