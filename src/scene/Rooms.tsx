import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialFor, MATERIALS, OPENING_MATERIALS } from '../editor/catalog/materials'
import { roomRect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Room } from '../types/design'
import { openingFills, type FillMaterial } from './openingFills'
import { overlayTokens } from './overlayTokens'
import { layoutWallBoxes, type WallBox } from './roomGeometry'
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
function buildWalls(rooms: Room[]) {
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return mergeByKey(layoutWallBoxes(rooms).map((b): [string, BufferGeometry] => [materialFor(roomById.get(b.roomId)?.materials.walls ?? null, 'walls').id, boxGeometry(b)]))
}

/** Door leaves, frames and glass, merged per material. */
function buildFills(rooms: Room[]) {
  return mergeByKey<FillMaterial>(rooms.flatMap((room) => room.openings.flatMap((o) => openingFills(room, o))).map((f) => [f.material, boxGeometry(f)]))
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

function FloorRooms({ floor, elevation, rooms }: { floor: number; elevation: number; rooms: Room[] }) {
  const walls = useMemo(() => buildWalls(rooms), [rooms])
  const fills = useMemo(() => buildFills(rooms), [rooms])
  const ceilings = useMemo(() => buildCeilings(rooms), [rooms])
  useEffect(() => () => [...walls, ...fills, ...ceilings].forEach((g) => g.geometry.dispose()), [walls, fills, ceilings])
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
    </group>
  )
}

/**
 * A floor below the one being edited, ghosted: see-through walls and slabs in the overlay
 * ghost colour with dashed outlines (DESIGN.md: ghosted floors, dashed). Takes no pointer events.
 */
function GhostFloor({ elevation, rooms }: { elevation: number; rooms: Room[] }) {
  const walls = useMemo(() => mergeByKey(layoutWallBoxes(rooms).map((b): [string, BufferGeometry] => ['walls', boxGeometry(b)])), [rooms])
  useEffect(() => () => walls.forEach((g) => g.geometry.dispose()), [walls])

  return (
    <group position-y={elevation} name="ghost-floor">
      {walls.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} raycast={noRaycast} renderOrder={-1}>
          <meshBasicMaterial color={overlayTokens.ghost} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
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
          <FloorRooms key={floor} floor={floor} elevation={elevation} rooms={floorRooms} />
        ) : (
          <GhostFloor key={floor} elevation={elevation} rooms={floorRooms} />
        )
      })}
    </>
  )
}
