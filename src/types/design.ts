// Design data: plain serialisable JSON (no classes, Maps or Three.js objects),
// so it can be saved to IndexedDB, exported, imported and checked later.
// All positions and sizes are in real-world metres (1 unit = 1 m); angles in radians.

export const DESIGN_SCHEMA_VERSION = 1

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

export type WallSide = 'north' | 'east' | 'south' | 'west'

/** A door or window cut into one of a room's walls. */
export interface Opening {
  id: string
  type: 'door' | 'window'
  wall: WallSide
  /** Distance from the wall's start to the opening's centre, in metres. */
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

/** A rectangle drawn on the grid: walls, floor and ceiling. */
export interface Room extends Placed {
  kind: 'room'
  name: string
  /** Interior size [width (x), height (y), depth (z)] in metres. */
  size: Vec3
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
  | 'stairs'
  | 'elevator'
  | 'slide'
  | 'fireman-pole'
  | 'fish-tank'
  | 'bookcase-passage'
  | 'screen-room'

/** A freeform piece placed at any position, rotation and height. */
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
