import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { createDesign, newId } from '../store/designStore'
import type { AppSettings } from '../types/appSettings'
import type { Design } from '../types/design'
import { migrateDesign } from './migrateDesign'

const DB_NAME = 'mansion-impossible'
const DB_VERSION = 2

interface MansionDb extends DBSchema {
  designs: { key: string; value: Design; indexes: { updatedAt: string } }
  /** App-wide preferences (not part of any design), stored under one key. */
  settings: { key: string; value: Partial<AppSettings> }
}

const APP_SETTINGS_KEY = 'app'

/** What the start screen shows per design, without holding every design open. */
export interface DesignSummary {
  id: string
  name: string
  updatedAt: string
  floorCount: number
  roomCount: number
}

let dbPromise: Promise<IDBPDatabase<MansionDb>> | null = null

function db(): Promise<IDBPDatabase<MansionDb>> {
  dbPromise ??= openDB<MansionDb>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const designs = database.createObjectStore('designs', { keyPath: 'id' })
        designs.createIndex('updatedAt', 'updatedAt')
      }
      if (oldVersion < 2) database.createObjectStore('settings')
    },
  })
  return dbPromise
}

const now = (): string => new Date().toISOString()

export function summarise(design: Design): DesignSummary {
  return {
    id: design.id,
    name: design.name,
    updatedAt: design.updatedAt,
    floorCount: design.floors.length,
    roomCount: design.rooms.length,
  }
}

/** Writes the design as is. Throws on failure (e.g. QuotaExceededError when storage is full). */
export async function saveDesign(design: Design): Promise<void> {
  await (await db()).put('designs', design)
}

export async function getDesign(id: string): Promise<Design | undefined> {
  const design = await (await db()).get('designs', id)
  return design && migrateDesign(design as unknown as Record<string, unknown>)
}

/** All saved designs, most recently edited first. */
export async function listDesigns(): Promise<DesignSummary[]> {
  const all = await (await db()).getAllFromIndex('designs', 'updatedAt')
  return all.reverse().map(summarise)
}

export async function deleteDesign(id: string): Promise<void> {
  await (await db()).delete('designs', id)
}

/** "Untitled mansion", or "Untitled mansion 2", 3… if taken. */
async function unusedName(base: string): Promise<string> {
  const taken = new Set((await listDesigns()).map((d) => d.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export async function createNewDesign(): Promise<Design> {
  const design = createDesign(await unusedName('Untitled mansion'))
  await saveDesign(design)
  return design
}

export async function renameDesign(id: string, name: string): Promise<Design> {
  const design = await getDesign(id)
  if (!design) throw new Error('That mansion no longer exists')
  const renamed = { ...design, name, updatedAt: now() }
  await saveDesign(renamed)
  return renamed
}

export async function duplicateDesign(id: string): Promise<Design> {
  const design = await getDesign(id)
  if (!design) throw new Error('That mansion no longer exists')
  const timestamp = now()
  const copy = { ...design, id: newId(), name: await unusedName(`${design.name} copy`), createdAt: timestamp, updatedAt: timestamp }
  await saveDesign(copy)
  return copy
}

/** Saves an imported design under a fresh id, so it never overwrites an existing one. */
export async function importDesign(design: Design): Promise<Design> {
  const imported = { ...design, id: newId(), updatedAt: now() }
  await saveDesign(imported)
  return imported
}

/** Saved app settings; missing or unknown fields are left for the caller to default. */
export async function loadAppSettings(): Promise<Partial<AppSettings>> {
  return (await (await db()).get('settings', APP_SETTINGS_KEY)) ?? {}
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await (await db()).put('settings', settings, APP_SETTINGS_KEY)
}
