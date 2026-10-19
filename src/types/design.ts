// Design data: plain serialisable JSON (no classes, Maps or Three.js objects),
// so it can be saved to IndexedDB, exported, imported and checked later.
// All positions and sizes are in real-world metres (1 unit = 1 m); angles in radians.

/** v2: rooms gained wallThickness and type. v3: openings gained style. */
export const DESIGN_SCHEMA_VERSION = 3

/** [x, y, z] in metres. y is up. */
export type Vec3 = [number, number, number]

/** Euler angles [x, y, z] in radians, XYZ order (Three.js default). */
export type Euler3 = [number, number, number]

/** Fields every placed object carries. */
export interface Placed {
  id: string
  /** Floor index: 0 = ground floor, 1+ upstairs, negative = basements. */
  floor: number
  /** Position relative to the floor's elevation, in metres. */
  position: Vec3
  rotation: Euler3
  /** Unitless multiplier on the object's own size. */
  scale: Vec3
}

export interface Floor {
  id: string
  index: number
  name: string
  /** Height of the floor surface above ground level (y = 0), in metres. */
  elevation: number
  /** Floor-to-ceiling height, in metres. */
  height: number
}

/** North is the room's -z side, east its +x side. */
export type WallSide = 'north' | 'east' | 'south' | 'west'

export type OpeningStyle = 'single-door' | 'double-door' | 'window' | 'glass-wall'

/** A door or window cut into one of a room's walls. */
export interface Opening {
  id: string
  /** Kept in step with style: doors have no sill. */
  type: 'door' | 'window'
  style: OpeningStyle
  wall: WallSide
  /**
   * Distance along the wall from its start to the opening's centre, in metres. North and
   * south walls start at the room's west end, east and west walls at its north end.
   */
  offset: number
  width: number
  height: number
  /** Height of the opening's bottom edge above the floor, in metres (0 for doors). */
  sill: number
}

/** Material ids per surface; ids refer to the materials catalogue. */
export interface RoomMaterials {
  floor: string | null
  walls: string | null
  ceiling: string | null
}

/**
 * A rectangle drawn on the grid: walls, floor and ceiling. Rooms are axis-aligned:
 * position is the centre of the footprint at floor level, and the footprint is the
 * wall centreline, so touching rooms share walls exactly. Rotation and scale are
 * kept for the data model but not applied to rooms.
 */
export interface Room extends Placed {
  kind: 'room'
  name: string
  /** Free label shown in the inspector, e.g. "Library". */
  type: string
  /** [width (x), wall height (y), length (z)] in metres, measured on the wall centreline. */
  size: Vec3
  /** Wall thickness in metres, centred on the footprint edge. */
  wallThickness: number
  openings: Opening[]
  materials: RoomMaterials
}

export type PieceType =
  | 'wall'
  | 'floor-panel'
  | 'dome'
  | 'tube'
  | 'platform'
  | 'pillar'
  | 'arch'
  | 'ramp'
  | 'stairs'
  | 'elevator'
  | 'slide'
  | 'fireman-pole'
  | 'fish-tank'
  | 'bookcase-passage'
  | 'screen-room'

/**
 * A freeform piece placed at any position, rotation and height. Position is the centre of
 * the piece's base relative to its floor; size is its bounding box before rotation (scale stays
 * [1, 1, 1] — the scale gizmo changes size).
 */
export interface Piece extends Placed {
  kind: 'piece'
  type: PieceType
  /** Base size [x, y, z] in metres, before scale. */
  size: Vec3
  material: string | null
}

/** A catalogue item: furniture, lighting or landscaping. */
export interface Furniture extends Placed {
  kind: 'furniture'
  /** Id in the furniture / landscaping catalogue. */
  catalogId: string
  material: string | null
}

export type DesignObject = Room | Piece | Furniture
export type ObjectKind = DesignObject['kind']

/** Heightmap terrain centred on the origin. */
export interface Terrain {
  /** Extent [x, z] in metres. */
  size: [number, number]
  /** Samples per side; heights has resolution × resolution entries, row-major (z then x). */
  resolution: number
  /** Ground height at each sample, in metres. */
  heights: number[]
}

export interface DesignSettings {
  /** Grid spacing for snapping, in metres. */
  gridSize: number
  snapToGrid: boolean
  /** Time of day for the day/night cycle, 0–24 hours. */
  timeOfDay: number
}

export interface Design {
  version: typeof DESIGN_SCHEMA_VERSION
  id: string
  name: string
  floors: Floor[]
  rooms: Room[]
  pieces: Piece[]
  furniture: Furniture[]
  terrain: Terrain
  settings: DesignSettings
  /** ISO 8601 timestamps. */
  createdAt: string
  updatedAt: string
}
