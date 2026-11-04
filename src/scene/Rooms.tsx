import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape, ShapeGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialFor, OPENING_MATERIALS, resolveMaterial, TANK_MATERIALS } from '../editor/catalog/materials'
import { openingSpan } from '../editor/openings'
import { floorHoles, holesInConvex, holesInRect } from '../editor/connectors/connectors'
import { isRound, roundOutline } from '../editor/roundRoom'
import { roomRect, type Rect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { CustomMaterial, FishTank, Floor, Piece, Room } from '../types/design'
import { openingFills, type FillMaterial } from './openingFills'
import { NO_CUSTOM, ghostMaterial, sharedMaterial, sharedMaterialById } from './materialCache'
import { overlayTokens } from './overlayTokens'
import { buildRoundGlass, buildWallFaces } from './wallFaces'
import { ScreenPanels } from './ScreenPanels'
import { worldUVs } from './worldUV'
import { layoutFloorWalls, onAquarium, type WallBox } from './roomGeometry'
import { useRoomPointer } from './useRoomPointer'
import { elevationOf } from './workPlane'

const SLAB = { bottom: -0.08, top: 0.02 }
const noRaycast = () => null

function boxGeometry(b: Omit<WallBox, 'roomId'>): BoxGeometry {
  const length = b.to - b.from
  const height = b.top - b.bottom
  const mid = (b.from + b.to) / 2
  const y = (b.bottom + b.top) / 2
  return b.axis === 'x'
    ? new BoxGeometry(length, height, b.thickness).translate(mid, y, b.line)
    : new BoxGeometry(b.thickness, height, length).translate(b.line, y, mid)
}

/** Merges geometries that share a key (a material) into one, disposing the parts. */
function mergeByKey<K>(parts: [K, BufferGeometry][]): { key: K; geometry: BufferGeometry }[] {
  const groups = new Map<K, BufferGeometry[]>()
  for (const [key, g] of parts) groups.set(key, [...(groups.get(key) ?? []), g])
  return [...groups].map(([key, list]) => {
    const geometry = mergeGeometries(list)
    list.forEach((g) => g.dispose())
    return { key, geometry }
  })
}


/** Door leaves, frames and glass, merged per material; none on aquarium walls (they aren't cut). */
function buildFills(rooms: Room[], aquarium: WallBox[]) {
  return mergeByKey<FillMaterial>(
    rooms.flatMap((room) => room.openings.filter((o) => !onAquarium(openingSpan(room, o), aquarium)).flatMap((o) => openingFills(room, o))).map((f) => [f.material, boxGeometry(f)]),
  )
}

/** Aquarium walls: every stretch of wall touching the tank, as one merged glass geometry (or null). */
function buildAquarium(aquarium: WallBox[]): BufferGeometry | null {
  return aquarium.length ? (mergeByKey(aquarium.map((b): [string, BufferGeometry] => ['aquarium', boxGeometry(b)]))[0]?.geometry ?? null) : null
}

const aquariumGlass = resolveMaterial(TANK_MATERIALS.glass)!
const aquariumGhost = { ...aquariumGlass, id: `${aquariumGlass.id}-ghost`, opacity: 0.15 }

/** Glass aquarium walls in the catalogue's aquarium glass (DESIGN.md: water = anything that became aquarium). */
function AquariumWalls({ geometry, ghost = false }: { geometry: BufferGeometry | null; ghost?: boolean }) {
  if (!geometry) return null
  return <mesh name="aquarium" geometry={geometry} renderOrder={2} raycast={ghost ? noRaycast : undefined} material={sharedMaterial(ghost ? aquariumGhost : aquariumGlass)} />
}

type Plan = [number, number]

const rectOutline = (r: Rect): Plan[] => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]

/** An outline with holes as a 2D shape; `flip` maps world z to -y (for shapes laid down with rotateX(-π/2)). */
function shapeWithHoles(outline: Plan[], holes: Plan[][], flip: boolean): Shape {
  const y = (z: number) => (flip ? -z : z)
  const shape = new Shape().moveTo(outline[0][0], y(outline[0][1]))
  for (const [x, z] of outline.slice(1)) shape.lineTo(x, y(z))
  shape.closePath()
  for (const hole of holes) {
    const path = new Path().moveTo(hole[0][0], y(hole[0][1]))
    for (const [x, z] of hole.slice(1)) path.lineTo(x, y(z))
    path.closePath()
    shape.holes.push(path)
  }
  return shape
}

/**
 * A room's floor slab: a box, or where a connector comes up through the floor, the same slab
 * with matching holes cut out. userData.holes counts them.
 */
function buildSlab(room: Room, holes: Plan[][]): BufferGeometry {
  const r = roomRect(room)
  // Round rooms: a disc (the wall centreline), connector holes trimmed to it.
  const round = isRound(room)
  const outline = round ? roundOutline(room) : rectOutline(r)
  const cut = round ? holesInConvex(outline, holes) : holesInRect(r, holes)
  const geometry = cut.length || round
    ? new ExtrudeGeometry(shapeWithHoles(outline, cut, true), { depth: SLAB.top - SLAB.bottom, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, SLAB.bottom, 0)
    : new BoxGeometry(r.x1 - r.x0, SLAB.top - SLAB.bottom, r.z1 - r.z0).translate((r.x0 + r.x1) / 2, (SLAB.bottom + SLAB.top) / 2, (r.z0 + r.z1) / 2)
  geometry.userData.holes = cut.length
  return worldUVs(geometry)
}

/** Ceilings face down: seen from inside a room, invisible from above in the editor. Connectors going up cut holes in them. */
function buildCeilings(rooms: Room[], holes: Plan[][], custom: readonly CustomMaterial[]) {
  return mergeByKey(
    rooms.map((room): [string, BufferGeometry] => {
      const r = roomRect(room)
      const round = isRound(room)
      const outline = round ? roundOutline(room, room.size[0] / 2 - room.wallThickness / 2) : rectOutline(r)
      const cut = round ? holesInConvex(outline, holes) : holesInRect(r, holes)
      const plane = cut.length || round
        ? new ShapeGeometry(shapeWithHoles(outline, cut, false)).rotateX(Math.PI / 2).translate(0, room.size[1] - 0.001, 0)
        : new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(Math.PI / 2).translate((r.x0 + r.x1) / 2, room.size[1] - 0.001, (r.z0 + r.z1) / 2)
      return [materialFor(room.materials.ceiling, 'ceiling', custom).id, worldUVs(plane)]
    }),
  )
}


interface FloorRoomsProps {
  floor: number
  elevation: number
  rooms: Room[]
  tank: FishTank | null
  /** Plan outlines of connectors coming up through this floor, and going on up through its ceilings. */
  slabHoles: Plan[][]
  ceilingHoles: Plan[][]
}

function FloorRooms({ floor, elevation, rooms, tank, slabHoles, ceilingHoles }: FloorRoomsProps) {
  const custom = useDesignStore((s) => s.design.customMaterials ?? NO_CUSTOM)
  // Walls touching the tank are worked out again whenever the rooms or the tank change.
  // Straight walls come from rectangular rooms; round rooms draw their own curved wall.
  const straight = useMemo(() => rooms.filter((r) => !isRound(r)), [rooms])
  const layout = useMemo(() => layoutFloorWalls(straight, tank), [straight, tank])
  // Face by face, one geometry per material: painting a face only moves it between groups.
  const walls = useMemo(() => buildWallFaces(layout.boxes, rooms, custom, tank), [rooms, layout, custom, tank])
  const fills = useMemo(() => buildFills(straight, layout.aquarium), [straight, layout])
  const aquarium = useMemo(() => buildAquarium(layout.aquarium), [layout])
  const roundGlass = useMemo(() => buildRoundGlass(rooms, tank), [rooms, tank])
  useEffect(() => () => roundGlass?.dispose(), [roundGlass])
  const ceilings = useMemo(() => buildCeilings(rooms, ceilingHoles, custom), [rooms, ceilingHoles, custom])
  const slabs = useMemo(() => rooms.map((room) => ({ room, geometry: buildSlab(room, slabHoles) })), [rooms, slabHoles])
  useEffect(() => () => [...walls, ...fills, ...ceilings, ...slabs].forEach((g) => g.geometry.dispose()), [walls, fills, ceilings, slabs])
  useEffect(() => () => aquarium?.dispose(), [aquarium])
  const pointer = useRoomPointer(floor, elevation, rooms)

  return (
    <group position-y={elevation} {...pointer}>
      {slabs.map(({ room, geometry }) => (
        <mesh
          key={room.id}
          name="slab"
          userData={{ roomId: room.id, holes: geometry.userData.holes }}
          geometry={geometry}
          material={sharedMaterialById(room.materials.floor, custom, 'oak')}
          castShadow
          receiveShadow
        />
      ))}
      {walls.map(({ key, geometry }) => (
        <mesh key={key} name="walls" userData={{ material: key }} geometry={geometry} material={sharedMaterialById(key, custom, 'warm-white')} castShadow receiveShadow />
      ))}
      {fills.map(({ key, geometry }) => (
        <mesh key={key} name={`opening-${key}`} geometry={geometry} material={sharedMaterialById(OPENING_MATERIALS[key], custom, 'glass')} castShadow={key !== 'glass'} receiveShadow={key !== 'glass'} />
      ))}
      {/* Ceilings face down, so they only catch clicks from below (the paint tool). */}
      {ceilings.map(({ key, geometry }) => (
        <mesh key={key} name="ceiling" userData={{ material: key }} geometry={geometry} material={sharedMaterialById(key, custom, 'plaster')} receiveShadow />
      ))}
      <AquariumWalls geometry={aquarium} />
      <AquariumWalls geometry={roundGlass} />
      {rooms.filter(isRound).map((room) => (
        <ScreenPanels key={room.id} room={room} />
      ))}
    </group>
  )
}

/**
 * A floor below the one being edited, ghosted: see-through walls and slabs in the overlay
 * ghost colour with dashed outlines (DESIGN.md: ghosted floors, dashed). Takes no pointer events.
 */
function GhostFloor({ elevation, rooms, tank }: { elevation: number; rooms: Room[]; tank: FishTank | null }) {
  const layout = useMemo(() => layoutFloorWalls(rooms.filter((r) => !isRound(r)), tank), [rooms, tank])
  const walls = useMemo(() => buildWallFaces(layout.boxes, rooms, NO_CUSTOM, tank), [layout, rooms, tank])
  const aquarium = useMemo(() => buildAquarium(layout.aquarium), [layout])
  const roundGlass = useMemo(() => buildRoundGlass(rooms, tank), [rooms, tank])
  useEffect(() => () => roundGlass?.dispose(), [roundGlass])
  useEffect(() => () => walls.forEach((g) => g.geometry.dispose()), [walls])
  useEffect(() => () => aquarium?.dispose(), [aquarium])

  return (
    <group position-y={elevation} name="ghost-floor">
      {walls.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} raycast={noRaycast} renderOrder={-1} material={ghostMaterial} />
      ))}
      <AquariumWalls geometry={aquarium} ghost />
      <AquariumWalls geometry={roundGlass} ghost />
      {rooms.map((room) => {
        const r = roomRect(room)
        const corners = isRound(room) ? roundOutline(room) : rectOutline(r)
        const loop = (y: number): [number, number, number][] => [...corners, corners[0]].map(([x, z]) => [x, y, z])
        return (
          <group key={room.id}>
            <Line points={loop(SLAB.top)} color={overlayTokens.ghost} lineWidth={1} dashed dashSize={0.3} gapSize={0.2} transparent opacity={0.8} raycast={noRaycast} />
            <Line points={loop(room.size[1])} color={overlayTokens.ghost} lineWidth={1} dashed dashSize={0.3} gapSize={0.2} transparent opacity={0.8} raycast={noRaycast} />
          </group>
        )
      })}
    </group>
  )
}

/** The active floor's rooms with the holes connectors cut through its slabs and ceilings. */
function ActiveFloorRooms({ pieces, floors, ...props }: Omit<FloorRoomsProps, 'slabHoles' | 'ceilingHoles'> & { pieces: Piece[]; floors: Floor[] }) {
  const holes = useMemo(() => {
    const design = { pieces, floors }
    return { slab: floorHoles(design, props.floor, 'slab'), ceiling: floorHoles(design, props.floor, 'ceiling') }
  }, [pieces, floors, props.floor])
  return <FloorRooms {...props} slabHoles={holes.slab} ceilingHoles={holes.ceiling} />
}

/**
 * All rooms, floor by floor. The active floor is drawn in full and takes pointer events;
 * floors above it are hidden; floors below are ghosted or hidden (the gauge's toggle).
 */
export function Rooms() {
  const rooms = useDesignStore((s) => s.design.rooms)
  const floors = useDesignStore((s) => s.design.floors)
  const tank = useDesignStore((s) => s.design.tank)
  const pieces = useDesignStore((s) => s.design.pieces)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)
  const byFloor = useMemo(() => {
    const groups = new Map<number, Room[]>()
    for (const room of rooms) groups.set(room.floor, [...(groups.get(room.floor) ?? []), room])
    return [...groups].sort(([a], [b]) => a - b)
  }, [rooms])

  return (
    <>
      {byFloor.map(([floor, floorRooms]) => {
        if (floor > activeFloor || (floor < activeFloor && belowFloors === 'hide')) return null
        const elevation = elevationOf(floors, floor)
        return floor === activeFloor ? (
          <ActiveFloorRooms key={floor} floor={floor} elevation={elevation} rooms={floorRooms} tank={tank} pieces={pieces} floors={floors} />
        ) : (
          <GhostFloor key={floor} elevation={elevation} rooms={floorRooms} tank={tank} />
        )
      })}
    </>
  )
}
