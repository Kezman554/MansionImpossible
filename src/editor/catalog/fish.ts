// Fish for the tank: species shapes, speeds and which materials tint them. Their colours live in
// the one materials catalogue (src/editor/catalog/materials.ts, the hidden 'fish-…' entries).
// Low-poly shapes built in code (src/scene/fishModels.ts) — nothing fetched or bundled; sizes in
// metres, nose along +x. Decorative: nothing about fish is stored in a design.

export type FishSpecies = 'tetra' | 'angelfish' | 'puffer'

export interface FishSpec {
  label: string
  /** Body length (x), height (y) and width (z), in metres. */
  size: [number, number, number]
  /** Swimming speed range, metres per second. */
  speed: [number, number]
  /** Material ids (materials catalogue) a school's fish are tinted with, picked per fish. */
  colours: string[]
  /** Share of each school (they add up to 1). */
  share: number
}

export const FISH_SPECIES: FishSpecies[] = ['tetra', 'angelfish', 'puffer']

export const FISH: Record<FishSpecies, FishSpec> = {
  tetra: { label: 'Tetra', size: [0.18, 0.06, 0.035], speed: [0.35, 0.8], colours: ['fish-neon-blue', 'fish-red', 'fish-sky'], share: 0.6 },
  angelfish: { label: 'Angelfish', size: [0.2, 0.24, 0.03], speed: [0.2, 0.45], colours: ['fish-pearl', 'fish-gold', 'fish-ink'], share: 0.25 },
  puffer: { label: 'Puffer', size: [0.24, 0.15, 0.13], speed: [0.15, 0.3], colours: ['fish-sand', 'fish-bronze'], share: 0.15 },
}
