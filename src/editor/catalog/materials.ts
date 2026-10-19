// Scene materials: design data, full colour, never the chrome palette (DESIGN.md).
// A null material on a surface means that surface's default below.

export interface SceneMaterial {
  id: string
  name: string
  color: string
  roughness: number
}

export const MATERIALS: Record<string, SceneMaterial> = {
  plaster: { id: 'plaster', name: 'Plaster', color: '#EDEAE2', roughness: 0.95 },
  'warm-white': { id: 'warm-white', name: 'Warm white', color: '#E4DCCB', roughness: 0.9 },
  oak: { id: 'oak', name: 'Oak boards', color: '#A87B4F', roughness: 0.75 },
  marble: { id: 'marble', name: 'Marble', color: '#D9D4CB', roughness: 0.35 },
}

export const DEFAULT_SURFACE_MATERIAL = { floor: 'oak', walls: 'warm-white', ceiling: 'plaster' } as const

export function materialFor(id: string | null, surface: keyof typeof DEFAULT_SURFACE_MATERIAL): SceneMaterial {
  return (id && MATERIALS[id]) || MATERIALS[DEFAULT_SURFACE_MATERIAL[surface]]
}
