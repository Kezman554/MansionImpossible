// The freeform piece palette: design data (scene shapes and their default materials).
import type { PieceType, Vec3 } from '../../types/design'

export interface PieceSpec {
  label: string
  /** Default bounding box [x, y, z] in metres. */
  size: Vec3
  /** Default material id from the materials catalogue. */
  material: string
  /** Palette icon, an outline in a 24-unit box. */
  icon: string
}

export const PIECE_PALETTE = ['wall', 'floor-panel', 'dome', 'tube', 'platform', 'pillar', 'arch', 'ramp'] as const satisfies readonly PieceType[]
export type PalettePiece = (typeof PIECE_PALETTE)[number]

export const PIECES: Record<PalettePiece, PieceSpec> = {
  wall: { label: 'Wall segment', size: [3, 3, 0.2], material: 'warm-white', icon: 'M3 6h18v12H3z' },
  'floor-panel': { label: 'Floor panel', size: [3, 0.2, 3], material: 'oak', icon: 'M2 14l10-5 10 5-10 5z' },
  dome: { label: 'Dome', size: [6, 3, 6], material: 'plaster', icon: 'M4 18a8 8 0 0 1 16 0M2 18h20' },
  tube: { label: 'Glass tube', size: [6, 3, 3], material: 'glass', icon: 'M5 7h14M5 17h14M5 7a2 5 0 0 0 0 10M19 7a2 5 0 0 1 0 10' },
  platform: { label: 'Platform', size: [3, 0.4, 3], material: 'marble', icon: 'M3 10h18v3H3zM6 13v7M18 13v7' },
  pillar: { label: 'Pillar', size: [0.5, 3, 0.5], material: 'marble', icon: 'M8 3h8M8 21h8M10 3v18M14 3v18' },
  arch: { label: 'Arch', size: [3, 3.5, 0.4], material: 'warm-white', icon: 'M4 21V11a8 8 0 0 1 16 0v10M8 21V11a4 4 0 0 1 8 0v10' },
  ramp: { label: 'Ramp', size: [4, 1.5, 2], material: 'marble', icon: 'M3 19h18V7z' },
}

/** Label for any piece type, including ones without a palette entry yet (stairs, slides…). */
export function pieceLabel(type: PieceType): string {
  return (PIECES as Partial<Record<PieceType, PieceSpec>>)[type]?.label ?? type.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
