// Brings designs saved by earlier versions of the app up to the current schema.
import { CONNECTOR_TYPES } from '../editor/connectors/catalog'
import { DESIGN_SCHEMA_VERSION, type Design } from '../types/design'

export const DEFAULT_WALL_THICKNESS = 0.2
export const DEFAULT_ROOM_TYPE = 'Room'
/** Midday: the sun high, the sky blue. */
export const DEFAULT_TIME_OF_DAY = 12

/** Oldest schema version this app can still open. */
export const OLDEST_SUPPORTED_VERSION = 1

type Loose = Record<string, unknown>

/** Returns the design at the current schema version. Already-current designs are returned as is. */
export function migrateDesign(design: Loose): Design {
  if (design.version === DESIGN_SCHEMA_VERSION) return design as unknown as Design
  let current = design

  // v1 → v2: rooms gained wallThickness and type.
  if (current.version === 1) {
    const rooms = (current.rooms as Loose[]).map((room) => ({
      ...room,
      wallThickness: typeof room.wallThickness === 'number' ? room.wallThickness : DEFAULT_WALL_THICKNESS,
      type: typeof room.type === 'string' ? room.type : DEFAULT_ROOM_TYPE,
    }))
    current = { ...current, rooms, version: 2 }
  }

  // v2 → v3: openings gained style.
  if (current.version === 2) {
    const rooms = (current.rooms as Loose[]).map((room) => ({
      ...room,
      openings: ((room.openings as Loose[] | undefined) ?? []).map((o) => ({
        ...o,
        style: typeof o.style === 'string' ? o.style : o.type === 'window' ? 'window' : 'single-door',
      })),
    }))
    current = { ...current, rooms, version: 3 }
  }

  // v3 → v4: designs gained the central fish tank (none yet).
  if (current.version === 3) current = { ...current, tank: current.tank ?? null, version: 4 }

  // v4 → v5: materials. Rooms gained per-face wall materials and designs custom colours.
  // Connectors (added within v4) always carry toFloor. The old 'fish-tank' piece type is gone:
  // design.tank is the only tank, so such placeholder pieces are dropped.
  if (current.version === 4) {
    const rooms = (current.rooms as Loose[]).map((room) => {
      const materials = (room.materials as Loose | undefined) ?? { floor: null, walls: null, ceiling: null }
      return { ...room, materials: { ...materials, faces: (materials.faces as Loose | undefined) ?? {} } }
    })
    const pieces = (current.pieces as Loose[])
      .filter((p) => p.type !== 'fish-tank')
      .map((p) => (CONNECTOR_TYPES.includes(p.type as never) && typeof p.toFloor !== 'number' ? { ...p, toFloor: p.floor } : p))
    current = { ...current, rooms, pieces, customMaterials: Array.isArray(current.customMaterials) ? current.customMaterials : [], version: 5 }
  }

  // v5 → v6: lights, and the time of day now drives the sun and sky. Designs open with no
  // lights and the default time of day (the slider was disabled before v6, so nothing is lost).
  if (current.version === 5) {
    const settings = (current.settings as Loose | undefined) ?? {}
    current = { ...current, lights: [], settings: { ...settings, timeOfDay: DEFAULT_TIME_OF_DAY }, version: 6 }
  }

  // v6 → v7: rooms gained a shape (all existing rooms are rectangular); round rooms and their
  // screens, and bookcase doors' hinge and open state, are new and optional.
  if (current.version === 6) {
    const rooms = (current.rooms as Loose[]).map((room) => ({ ...room, shape: room.shape === 'round' ? 'round' : 'rectangular' }))
    current = { ...current, rooms, version: 7 }
  }

  return current as unknown as Design
}
