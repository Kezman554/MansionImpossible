// Scene materials: design data, full colour, never the chrome palette (DESIGN.md). This is the
// one catalogue: room surfaces, pieces, connectors, opening fills, the tank's glass and water.
// A null material on a surface means that surface's default below. Colours mixed with the
// custom colour picker live in the design (design.customMaterials) and resolve the same way.
import type { CustomMaterial } from '../../types/design'
import type { TextureKind } from './textures'

export type MaterialCategory = 'wood' | 'marble' | 'tile' | 'carpet' | 'glass' | 'metal' | 'concrete' | 'brick' | 'plain' | 'water'

export interface SceneMaterial {
  id: string
  name: string
  category: MaterialCategory
  /** Base colour (#rrggbb); a texture's grey pattern is multiplied by it. */
  color: string
  roughness: number
  /** Metals reflect the scene's generated environment map (src/scene/Environment.tsx). */
  metalness?: number
  /** Below 1 = see-through (glass). */
  opacity?: number
  /** A small tiling pattern generated in code (src/editor/catalog/textures.ts); none = flat shaded. */
  texture?: { kind: TextureKind; /** Metres covered by one repeat of the pattern. */ scale: number }
  /** Kept out of the paint picker (the tank's water: not a surface finish). */
  hidden?: boolean
}

type Entry = Omit<SceneMaterial, 'id'>

const ENTRIES: Record<string, Entry> = {
  // Wood
  oak: { name: 'Oak boards', category: 'wood', color: '#B88A5A', roughness: 0.75, texture: { kind: 'wood', scale: 1.6 } },
  walnut: { name: 'Walnut boards', category: 'wood', color: '#7A5233', roughness: 0.7, texture: { kind: 'wood', scale: 1.6 } },
  ash: { name: 'Pale ash', category: 'wood', color: '#D9C29A', roughness: 0.75, texture: { kind: 'wood', scale: 1.6 } },
  'book-spines': { name: 'Book spines', category: 'wood', color: '#B4543C', roughness: 0.8, texture: { kind: 'books', scale: 1 }, hidden: true },
  'door-oak': { name: 'Oak door', category: 'wood', color: '#8A5A33', roughness: 0.6 },
  // Marble
  marble: { name: 'White marble', category: 'marble', color: '#E2DDD4', roughness: 0.3, texture: { kind: 'marble', scale: 2 } },
  'marble-noir': { name: 'Black marble', category: 'marble', color: '#4A4A50', roughness: 0.25, texture: { kind: 'marble', scale: 2 } },
  'marble-green': { name: 'Green marble', category: 'marble', color: '#5E8C74', roughness: 0.3, texture: { kind: 'marble', scale: 2 } },
  // Tile
  'tile-white': { name: 'White tiles', category: 'tile', color: '#F0EEE8', roughness: 0.35, texture: { kind: 'tile', scale: 1.2 } },
  'tile-terracotta': { name: 'Terracotta tiles', category: 'tile', color: '#C46E4A', roughness: 0.6, texture: { kind: 'tile', scale: 1.2 } },
  'tile-azure': { name: 'Azure tiles', category: 'tile', color: '#4F86B8', roughness: 0.35, texture: { kind: 'tile', scale: 0.6 } },
  // Carpet
  'carpet-red': { name: 'Red carpet', category: 'carpet', color: '#9E2F38', roughness: 1, texture: { kind: 'carpet', scale: 1 } },
  'carpet-grey': { name: 'Grey carpet', category: 'carpet', color: '#8B8C8E', roughness: 1, texture: { kind: 'carpet', scale: 1 } },
  'carpet-navy': { name: 'Navy carpet', category: 'carpet', color: '#2E3E66', roughness: 1, texture: { kind: 'carpet', scale: 1 } },
  // Glass
  glass: { name: 'Clear glass', category: 'glass', color: '#B9DCE3', roughness: 0.05, opacity: 0.28 },
  'glass-frosted': { name: 'Frosted glass', category: 'glass', color: '#E4EEF0', roughness: 0.6, opacity: 0.6 },
  'aquarium-glass': { name: 'Aquarium glass', category: 'glass', color: '#39C6D6', roughness: 0.05, metalness: 0.1, opacity: 0.3 },
  // Metal
  steel: { name: 'Brushed steel', category: 'metal', color: '#A3ACB1', roughness: 0.35, metalness: 0.6, texture: { kind: 'brushed', scale: 1 } },
  chrome: { name: 'Chrome', category: 'metal', color: '#D5DADD', roughness: 0.12, metalness: 0.9 },
  brass: { name: 'Brass', category: 'metal', color: '#C9A24A', roughness: 0.3, metalness: 0.7 },
  gold: { name: 'Gold', category: 'metal', color: '#E3B53B', roughness: 0.22, metalness: 0.9 },
  copper: { name: 'Copper', category: 'metal', color: '#C27A4E', roughness: 0.3, metalness: 0.8 },
  // Concrete
  concrete: { name: 'Concrete', category: 'concrete', color: '#A8A6A0', roughness: 0.9, texture: { kind: 'concrete', scale: 2 } },
  'concrete-polished': { name: 'Polished concrete', category: 'concrete', color: '#BDBBB5', roughness: 0.45, texture: { kind: 'concrete', scale: 3 } },
  // Brick
  'brick-red': { name: 'Red brick', category: 'brick', color: '#A5503A', roughness: 0.9, texture: { kind: 'brick', scale: 1 } },
  'brick-white': { name: 'Whitewashed brick', category: 'brick', color: '#E6E1D8', roughness: 0.9, texture: { kind: 'brick', scale: 1 } },
  // Plain colours
  plaster: { name: 'Plaster', category: 'plain', color: '#EDEAE2', roughness: 0.95 },
  'warm-white': { name: 'Warm white', category: 'plain', color: '#E4DCCB', roughness: 0.9 },
  'frame-white': { name: 'White frame', category: 'plain', color: '#F2F0EA', roughness: 0.5 },
  'screen-off': { name: 'Blank screen', category: 'plain', color: '#14181C', roughness: 0.15, metalness: 0.2, hidden: true },
  charcoal: { name: 'Charcoal', category: 'plain', color: '#3A3D40', roughness: 0.85 },
  sage: { name: 'Sage', category: 'plain', color: '#9DB39A', roughness: 0.85 },
  navy: { name: 'Navy', category: 'plain', color: '#2C3E5C', roughness: 0.85 },
  blush: { name: 'Blush', category: 'plain', color: '#E7B9AE', roughness: 0.85 },
  ochre: { name: 'Ochre', category: 'plain', color: '#C99A3E', roughness: 0.85 },
  'slide-yellow': { name: 'Sunny plastic', category: 'plain', color: '#F2C14E', roughness: 0.4 },
  // The tank (DESIGN.md: its tint is the one deliberate crossover with the UI water token)
  water: { name: 'Tank water', category: 'water', color: '#39C6D6', roughness: 0.1, hidden: true },
  // Fish (src/editor/catalog/fish.ts picks from these): instance tints on one flat-shaded material
  'fish-neon-blue': { name: 'Neon blue fish', category: 'water', color: '#3FB7E8', roughness: 0.55, hidden: true },
  'fish-red': { name: 'Red fish', category: 'water', color: '#E8473F', roughness: 0.55, hidden: true },
  'fish-sky': { name: 'Sky fish', category: 'water', color: '#5ED3F0', roughness: 0.55, hidden: true },
  'fish-pearl': { name: 'Pearl fish', category: 'water', color: '#F2E6C8', roughness: 0.55, hidden: true },
  'fish-gold': { name: 'Gold fish', category: 'water', color: '#F2B33D', roughness: 0.55, hidden: true },
  'fish-ink': { name: 'Ink fish', category: 'water', color: '#1F2A33', roughness: 0.55, hidden: true },
  'fish-sand': { name: 'Sand fish', category: 'water', color: '#D9C27A', roughness: 0.55, hidden: true },
  'fish-bronze': { name: 'Bronze fish', category: 'water', color: '#B98F5A', roughness: 0.55, hidden: true },
}

export const MATERIALS: Record<string, SceneMaterial> = Object.fromEntries(Object.entries(ENTRIES).map(([id, entry]) => [id, { id, ...entry }]))

export const MATERIAL_CATEGORIES: { id: MaterialCategory; label: string }[] = [
  { id: 'wood', label: 'Wood' },
  { id: 'marble', label: 'Marble' },
  { id: 'tile', label: 'Tile' },
  { id: 'carpet', label: 'Carpet' },
  { id: 'glass', label: 'Glass' },
  { id: 'metal', label: 'Metal' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'brick', label: 'Brick' },
  { id: 'plain', label: 'Plain colours' },
]

/** Fixed materials for door leaves, window frames and glazing until they get their own pickers. */
export const OPENING_MATERIALS = { door: 'door-oak', frame: 'frame-white', glass: 'glass', shelf: 'walnut', books: 'book-spines' } as const

export const DEFAULT_SURFACE_MATERIAL = { floor: 'oak', walls: 'warm-white', ceiling: 'plaster' } as const

/** The tank's materials: its water (shader tint) and the glass of aquarium walls. */
export const TANK_MATERIALS = { water: 'water', glass: 'aquarium-glass' } as const

/** First colour the custom colour picker offers. */
export const DEFAULT_CUSTOM_COLOUR = '#C8785A'
export const CUSTOM_PREFIX = 'custom-'

/** A custom colour as a flat material; the id carries the colour, so one colour is one material. */
export function customMaterial(colour: string): CustomMaterial {
  const hex = colour.replace('#', '').toLowerCase().slice(0, 6)
  return { id: `${CUSTOM_PREFIX}${hex}`, name: `Custom ${hex.toUpperCase()}`, color: `#${hex}`, roughness: 0.8 }
}

/** A material by id: the catalogue, else the design's custom colours; undefined if unknown. */
export function resolveMaterial(id: string | null | undefined, custom: readonly CustomMaterial[] = []): SceneMaterial | undefined {
  if (!id) return undefined
  if (MATERIALS[id]) return MATERIALS[id]
  const c = custom.find((m) => m.id === id) ?? (id.startsWith(CUSTOM_PREFIX) && /^[0-9a-f]{6}$/.test(id.slice(CUSTOM_PREFIX.length)) ? customMaterial(id.slice(CUSTOM_PREFIX.length)) : undefined)
  return c && { ...c, category: 'plain' }
}

export function materialFor(id: string | null, surface: keyof typeof DEFAULT_SURFACE_MATERIAL, custom: readonly CustomMaterial[] = []): SceneMaterial {
  return resolveMaterial(id, custom) ?? MATERIALS[DEFAULT_SURFACE_MATERIAL[surface]]
}

/** Materials the paint picker offers, by category. */
export function pickableMaterials(category: MaterialCategory): SceneMaterial[] {
  return Object.values(MATERIALS).filter((m) => m.category === category && !m.hidden)
}
