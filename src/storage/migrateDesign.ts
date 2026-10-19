// Brings designs saved by earlier versions of the app up to the current schema.
import { DESIGN_SCHEMA_VERSION, type Design } from '../types/design'

export const DEFAULT_WALL_THICKNESS = 0.2
export const DEFAULT_ROOM_TYPE = 'Room'

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

  return current as unknown as Design
}
