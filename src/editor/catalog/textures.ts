// Small tiling patterns for the low-poly look, generated in code (nothing fetched, nothing
// bundled, so no licence files): greyscale RGBA pixels that a material's colour tints. Each
// pattern tiles seamlessly (value noise wraps at the edge). Pure functions, testable in Node.

export type TextureKind = 'wood' | 'marble' | 'tile' | 'carpet' | 'brick' | 'concrete' | 'brushed' | 'books'

export const TEXTURE_KINDS: TextureKind[] = ['wood', 'marble', 'tile', 'carpet', 'brick', 'concrete', 'brushed', 'books']
/** Pixels per side: small, so all seven patterns together are under 200 KB of GPU memory. */
export const TEXTURE_SIZE = 64

/** Deterministic hash of integer coordinates to [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise on a grid of `cells` per side, wrapping so the pattern tiles. */
function noise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells
  const y = v * cells
  const [x0, y0] = [Math.floor(x), Math.floor(y)]
  const [fx, fy] = [x - x0, y - y0]
  const s = (t: number) => t * t * (3 - 2 * t)
  const at = (i: number, j: number) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed)
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(fx)
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(fx)
  return top + (bottom - top) * s(fy)
}

const fbm = (u: number, v: number, seed: number) => noise(u, v, 4, seed) * 0.55 + noise(u, v, 8, seed + 1) * 0.3 + noise(u, v, 16, seed + 2) * 0.15

/** Brightness 0–1 at (u, v) ∈ [0, 1)² for each pattern. */
const PATTERNS: Record<TextureKind, (u: number, v: number) => number> = {
  // Four boards per tile with staggered joints and a fine grain along each board.
  wood: (u, v) => {
    const board = Math.floor(v * 4)
    const across = (v * 4) % 1
    const joint = (u + hash(board, 0, 7) * 0.5) % 1
    const gap = across < 0.06 || joint < 0.015 ? 0.62 : 1
    const grain = 0.86 + 0.14 * noise(u * 0.25, v * 4, 16, board + 3)
    return gap * (grain * (0.92 + hash(board, 1, 9) * 0.08))
  },
  // Soft veins: a turbulent sine banded across the tile.
  marble: (u, v) => {
    const t = fbm(u, v, 11)
    const vein = Math.abs(Math.sin((u + v + t * 1.6) * Math.PI * 2))
    return 0.8 + 0.2 * Math.pow(vein, 0.35)
  },
  // Four by four tiles with light grout and a little variation tile to tile.
  tile: (u, v) => {
    const [cu, cv] = [(u * 4) % 1, (v * 4) % 1]
    const grout = cu < 0.05 || cv < 0.05
    return grout ? 0.72 : 0.94 + hash(Math.floor(u * 4), Math.floor(v * 4), 5) * 0.06
  },
  carpet: (u, v) => 0.84 + 0.16 * (noise(u, v, 32, 21) * 0.6 + hash(Math.floor(u * 64), Math.floor(v * 64), 23) * 0.4),
  // Running bond: four courses, each brick a quarter of the tile wide, alternate courses offset.
  brick: (u, v) => {
    const course = Math.floor(v * 4)
    const along = (u * 2 + (course % 2) * 0.5) % 1
    const mortar = (v * 4) % 1 < 0.1 || along < 0.04
    return mortar ? 1 : 0.78 + hash(Math.floor(u * 2 + (course % 2) * 0.5), course, 31) * 0.14
  },
  concrete: (u, v) => 0.82 + 0.18 * fbm(u, v, 41),
  // Fine streaks along u.
  brushed: (u, v) => 0.88 + 0.12 * noise(u * 0.125, v, 64, 51),
  // Book spines: 24 vertical bands of varied brightness, with darker gaps and a light band near the top.
  books: (u, v) => {
    const spine = Math.floor(u * 24)
    const across = (u * 24) % 1
    const gap = across < 0.08 ? 0.45 : 1
    const band = v > 0.78 && v < 0.84 ? 1.25 : 1
    return Math.min(1, gap * band * (0.5 + hash(spine, 3, 61) * 0.5))
  },
}

/** The pattern as RGBA bytes, TEXTURE_SIZE × TEXTURE_SIZE, grey (r = g = b), opaque. */
export function texturePixels(kind: TextureKind, size = TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  const pattern = PATTERNS[kind]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = Math.round(Math.min(1, Math.max(0, pattern(x / size, y / size))) * 255)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = value
      data[i + 3] = 255
    }
  }
  return data
}
