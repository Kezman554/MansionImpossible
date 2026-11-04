import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialFor, MATERIALS, OPENING_MATERIALS } from '../editor/catalog/materials'
import { openingSpan } from '../editor/openings'
import { roomRect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { FishTank, Room } from '../types/design'
import { openingFills, type FillMaterial } from './openingFills'
import { overlayTokens } from './overlayTokens'
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

/** One merged geometry per wall material: merged walls with door and window holes cut out. */
function buildWalls(rooms: Room[], boxes: WallBox[]) {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return mergeByKey(boxes.map((b): [string, BufferGeometry] => [materialFor(roomById.get(b.roomId)?.materials.walls ?? null, 'walls').id, boxGeometry(b)]))
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

/** Glass aquarium walls, tinted with the water token (DESIGN.md: water = anything that became aquarium). */
function AquariumWalls({ geometry, ghost = false }: { geometry: BufferGeometry | null; ghost?: boolean }) {
  if (!geometry) return null
  return (
    <mesh name="aquarium" geometry={geometry} renderOrder={2} raycast={ghost ? noRaycast : undefined}>
      <meshStandardMaterial color={overlayTokens.water} roughness={0.05} metalness={0.1} transparent opacity={ghost ? 0.15 : 0.3} depthWrite={false} />
    </mesh>
  )
}

/** Ceilings face down: seen from inside a room, invisible from above in the editor. */
function buildCeilings(rooms: Room[]) {
  return mergeByKey(
    rooms.map((room): [string, BufferGeometry] => {
      const r = roomRect(room)
      const plane = new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(Math.PI / 2).translate((r.x0 + r.x1) / 2, room.size[1] - 0.001, (r.z0 + r.z1) / 2)
      return [materialFor(room.materials.ceiling, 'ceiling').id, plane]
    }),
  )
}

function SurfaceMaterial({ id }: { id: string }) {
  const m = MATERIALS[id]
  const seeThrough = m.opacity !== undefined && m.opacity < 1
  return <meshStandardMaterial color={m.color} roughness={m.roughness} transparent={seeThrough} opacity={m.opacity ?? 1} depthWrite={!seeThrough} />
}

function FloorRooms({ floor, elevation, rooms, tank }: { floor: number; elevation: number; rooms: Room[]; tank: FishTank | null }) {
  // Walls touching the tank are worked out again whenever the rooms or the tank change.
  const layout = useMemo(() => layoutFloorWalls(rooms, tank), [rooms, tank])
  const walls = useMemo(() => buildWalls(rooms, layout.boxes), [rooms, layout])
  const fills = useMemo(() => buildFills(rooms, layout.aquarium), [rooms, layout])
  const aquarium = useMemo(() => buildAquarium(layout.aquarium), [layout])
  const ceilings = useMemo(() => buildCeilings(rooms), [rooms])
  useEffect(() => () => [...walls, ...fills, ...ceilings].forEach((g) => g.geometry.dispose()), [walls, fills, ceilings])
  useEffect(() => () => aquarium?.dispose(), [aquarium])
  const pointer = useRoomPointer(floor, elevation, rooms)

  return (
    <group position-y={elevation} {...pointer}>
      {rooms.map((room) => {
        const r = roomRect(room)
        return (
          <mesh key={room.id} position={[(r.x0 + r.x1) / 2, (SLAB.bottom + SLAB.top) / 2, (r.z0 + r.z1) / 2]} castShadow receiveShadow>
            <boxGeometry args={[r.x1 - r.x0, SLAB.top - SLAB.bottom, r.z1 - r.z0]} />
            <SurfaceMaterial id={materialFor(room.materials.floor, 'floor').id} />
          </mesh>
        )
      })}
      {walls.map(({ key, geometry }) => (
        <mesh key={key} name="walls" geometry={geometry} castShadow receiveShadow>
          <SurfaceMaterial id={key} />
        </mesh>
      ))}
      {fills.map(({ key, geometry }) => (
        <mesh key={key} name={`opening-${key}`} geometry={geometry} castShadow={key !== 'glass'} receiveShadow={key !== 'glass'}>
          <SurfaceMaterial id={OPENING_MATERIALS[key]} />
        </mesh>
      ))}
      {ceilings.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} receiveShadow raycast={noRaycast}>
          <SurfaceMaterial id={key} />
        </mesh>
      ))}
      <AquariumWalls geometry={aquarium} />
    </group>
  )
}

/**
 * A floor below the one being edited, ghosted: see-through walls and slabs in the overlay
 * ghost colour with dashed outlines (DESIGN.md: ghosted floors, dashed). Takes no pointer events.
 */
function GhostFloor({ elevation, rooms, tank }: { elevation: number; rooms: Room[]; tank: FishTank | null }) {
  const layout = useMemo(() => layoutFloorWalls(rooms, tank), [rooms, tank])
  const walls = useMemo(() => mergeByKey(layout.boxes.map((b): [string, BufferGeometry] => ['walls', boxGeometry(b)])), [layout])
  const aquarium = useMemo(() => buildAquarium(layout.aquarium), [layout])
  useEffect(() => () => walls.forEach((g) => g.geometry.dispose()), [walls])
  useEffect(() => () => aquarium?.dispose(), [aquarium])

  return (
    <group position-y={elevation} name="ghost-floor">
      {walls.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} raycast={noRaycast} renderOrder={-1}>
          <meshBasicMaterial color={overlayTokens.ghost} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <AquariumWalls geometry={aquarium} ghost />
      {rooms.map((room) => {
        const r = roomRect(room)
        const loop = (y: number): [number, number, number][] => [[r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], [r.x0, y, r.z0]]
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

/**
 * All rooms, floor by floor. The active floor is drawn in full and takes pointer events;
 * floors above it are hidden; floors below are ghosted or hidden (the gauge's toggle).
 */
export function Rooms() {
  const rooms = useDesignStore((s) => s.design.rooms)
  const floors = useDesignStore((s) => s.design.floors)
  const tank = useDesignStore((s) => s.design.tank)
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
          <FloorRooms key={floor} floor={floor} elevation={elevation} rooms={floorRooms} tank={tank} />
        ) : (
          <GhostFloor key={floor} elevation={elevation} rooms={floorRooms} tank={tank} />
        )
      })}
    </>
  )
}
