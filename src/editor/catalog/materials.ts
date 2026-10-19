// Scene materials: design data, full colour, never the chrome palette (DESIGN.md).
// A null material on a surface means that surface's default below.

export interface SceneMaterial {
  id: string
  name: string
  color: string
  roughness: number
  /** Below 1 = see-through (glass). */
  opacity?: number
}

export const MATERIALS: Record<string, SceneMaterial> = {
  plaster: { id: 'plaster', name: 'Plaster', color: '#EDEAE2', roughness: 0.95 },
  'warm-white': { id: 'warm-white', name: 'Warm white', color: '#E4DCCB', roughness: 0.9 },
  oak: { id: 'oak', name: 'Oak boards', color: '#A87B4F', roughness: 0.75 },
  marble: { id: 'marble', name: 'Marble', color: '#D9D4CB', roughness: 0.35 },
  'door-oak': { id: 'door-oak', name: 'Oak door', color: '#8A5A33', roughness: 0.6 },
  'frame-white': { id: 'frame-white', name: 'White frame', color: '#F2F0EA', roughness: 0.5 },
  glass: { id: 'glass', name: 'Clear glass', color: '#B9DCE3', roughness: 0.05, opacity: 0.28 },
}

/** Fixed materials for door leaves, window frames and glazing until they get their own pickers. */
export const OPENING_MATERIALS = { door: 'door-oak', frame: 'frame-white', glass: 'glass' } as const

export const DEFAULT_SURFACE_MATERIAL = { floor: 'oak', walls: 'warm-white', ceiling: 'plaster' } as const

export function materialFor(id: string | null, surface: keyof typeof DEFAULT_SURFACE_MATERIAL): SceneMaterial {
  return (id && MATERIALS[id]) || MATERIALS[DEFAULT_SURFACE_MATERIAL[surface]]
}
