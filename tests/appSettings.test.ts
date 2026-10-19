import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, withDefaults } from '../src/types/appSettings'

describe('app settings', () => {
  it('fills missing or invalid values with defaults', () => {
    expect(withDefaults({})).toEqual(DEFAULT_APP_SETTINGS)
    expect(withDefaults({ quality: 'ultra', showFps: 'yes' })).toEqual(DEFAULT_APP_SETTINGS)
    expect(withDefaults({ quality: 'high', showFps: true })).toEqual({ quality: 'high', showFps: true })
  })

  it('upgrades a version 1 database without losing designs, then saves and loads settings', async () => {
    // A database as the previous release left it: designs only.
    const v1 = await openDB('mansion-impossible', 1, {
      upgrade(db) {
        db.createObjectStore('designs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      },
    })
    await v1.put('designs', { id: 'kept', name: 'Kestrel Hall', updatedAt: '2026-10-19T00:00:00.000Z', floors: [], rooms: [] })
    v1.close()

    const db = await import('../src/storage/designDb')
    expect((await db.getDesign('kept'))?.name).toBe('Kestrel Hall')
    expect(await db.loadAppSettings()).toEqual({})

    await db.saveAppSettings({ quality: 'low', showFps: true })
    expect(withDefaults(await db.loadAppSettings())).toEqual({ quality: 'low', showFps: true })
  })

  it('the settings store loads saved values and persists changes', async () => {
    const { useSettingsStore } = await import('../src/store/settingsStore')
    await useSettingsStore.getState().load()
    expect(useSettingsStore.getState()).toMatchObject({ quality: 'low', showFps: true, loaded: true })

    useSettingsStore.getState().update({ quality: 'high' })
    const { loadAppSettings } = await import('../src/storage/designDb')
    await expect.poll(() => loadAppSettings()).toEqual({ quality: 'high', showFps: true })
  })
})
