import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferGeometry, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialFor } from '../editor/catalog/materials'
import { moveRect, placementFromRect, roomAtPoint, roomRect, type Rect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Room } from '../types/design'
import { layoutWalls } from './roomGeometry'
import { CLICK_TOLERANCE_PX, elevationOf, pointAtHeight } from './workPlane'

const SLAB = { bottom: -0.08, top: 0.02 }
const noRaycast = () => null

/** One merged geometry per wall material, built from the floor's merged wall pieces. */
function buildWalls(rooms: Room[]): { materialId: string; geometry: BufferGeometry }[] {
  const byMaterial = new Map<string, BufferGeometry[]>()
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  for (const piece of layoutWalls(rooms)) {
    const length = piece.to - piece.from
    const mid = (piece.from + piece.to) / 2
    const box =
      piece.axis === 'x'
        ? new BoxGeometry(length, piece.height, piece.thickness).translate(mid, piece.height / 2, piece.line)
        : new BoxGeometry(piece.thickness, piece.height, length).translate(piece.line, piece.height / 2, mid)
    const materialId = materialFor(roomById.get(piece.roomId)?.materials.walls ?? null, 'walls').id
    byMaterial.set(materialId, [...(byMaterial.get(materialId) ?? []), box])
  }
  return [...byMaterial].map(([materialId, boxes]) => {
    const geometry = mergeGeometries(boxes)
    boxes.forEach((b) => b.dispose())
    return { materialId, geometry }
  })
}

/** Ceilings face down: seen from inside a room, invisible from above in the editor. */
function buildCeilings(rooms: Room[]): { materialId: string; geometry: BufferGeometry }[] {
  const byMaterial = new Map<string, BufferGeometry[]>()
  for (const room of rooms) {
    const r = roomRect(room)
    const plane = new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0)
      .rotateX(Math.PI / 2)
      .translate((r.x0 + r.x1) / 2, room.size[1] - 0.001, (r.z0 + r.z1) / 2)
    const materialId = materialFor(room.materials.ceiling, 'ceiling').id
    byMaterial.set(materialId, [...(byMaterial.get(materialId) ?? []), plane])
  }
  return [...byMaterial].map(([materialId, planes]) => {
    const geometry = mergeGeometries(planes)
    planes.forEach((p) => p.dispose())
    return { materialId, geometry }
  })
}

function SurfaceMaterial({ id, surface }: { id: string; surface: 'walls' | 'ceiling' | 'floor' }) {
  const m = materialFor(id, surface)
  return <meshStandardMaterial color={m.color} roughness={m.roughness} />
}

interface MoveDrag {
  roomId: string
  start: { x: number; z: number }
  rect: Rect
  height: number
  checkpointed: boolean
}

function FloorRooms({ floor, elevation, rooms }: { floor: number; elevation: number; rooms: Room[] }) {
  const walls = useMemo(() => buildWalls(rooms), [rooms])
  const ceilings = useMemo(() => buildCeilings(rooms), [rooms])
  useEffect(() => () => walls.forEach((w) => w.geometry.dispose()), [walls])
  useEffect(() => () => ceilings.forEach((c) => c.geometry.dispose()), [ceilings])

  // Read live from R3F in handlers: the orbit controls are switched off while dragging.
  const get = useThree((s) => s.get)
  const setOrbit = (enabled: boolean) => {
    const controls = get().controls as { enabled: boolean } | null
    if (controls) controls.enabled = enabled
  }
  const setCursor = (cursor: string) => {
    get().gl.domElement.style.cursor = cursor
  }
  const drag = useRef<MoveDrag | null>(null)

  const roomUnder = (e: ThreeEvent<PointerEvent | MouseEvent>) => roomAtPoint(rooms, floor, e.point.x, e.point.z)
  const isSelecting = () => useEditorStore.getState().tool === 'select'

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!isSelecting() || e.button !== 0) return
    // Resize handles draw on top of walls, so they win even when a wall is nearer.
    if (e.intersections.some((i) => i.object.name.startsWith('handle-'))) return
    const room = roomUnder(e)
    if (!room) return
    e.stopPropagation()
    if (!useDesignStore.getState().selection.includes(room.id)) return // first click selects (onClick)
    const start = pointAtHeight(e.ray, elevation)
    if (!start) return
    drag.current = { roomId: room.id, start, rect: roomRect(room), height: room.size[1], checkpointed: false }
    setOrbit(false)
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    if (!d) {
      if (isSelecting()) {
        const room = roomUnder(e)
        setCursor(room && useDesignStore.getState().selection.includes(room.id) ? 'move' : room ? 'pointer' : '')
      }
      return
    }
    const p = pointAtHeight(e.ray, elevation)
    if (!p) return
    const rect = moveRect(d.rect, p.x - d.start.x, p.z - d.start.z)
    const store = useDesignStore.getState()
    const current = store.design.rooms.find((r) => r.id === d.roomId)
    if (!current) return
    const next = placementFromRect(rect, d.height, current.position[1])
    if (next.position[0] === current.position[0] && next.position[2] === current.position[2]) return
    if (!d.checkpointed) {
      store.checkpoint()
      d.checkpointed = true
      useEditorStore.getState().setDragging(true)
    }
    store.updateObject(d.roomId, { position: next.position }, { record: false })
  }

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    drag.current = null
    setOrbit(true)
    useEditorStore.getState().setDragging(false)
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isSelecting() || e.delta > CLICK_TOLERANCE_PX) return
    const room = roomUnder(e)
    if (!room) return
    e.stopPropagation()
    useDesignStore.getState().select(room.id, { additive: e.shiftKey })
  }

  return (
    <group
      position-y={elevation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerOut={() => !drag.current && setCursor('')}
      onClick={onClick}
    >
      {rooms.map((room) => {
        const r = roomRect(room)
        return (
          <mesh
            key={room.id}
            position={[(r.x0 + r.x1) / 2, (SLAB.bottom + SLAB.top) / 2, (r.z0 + r.z1) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[r.x1 - r.x0, SLAB.top - SLAB.bottom, r.z1 - r.z0]} />
            <SurfaceMaterial id={materialFor(room.materials.floor, 'floor').id} surface="floor" />
          </mesh>
        )
      })}
      {walls.map(({ materialId, geometry }) => (
        <mesh key={materialId} geometry={geometry} castShadow receiveShadow>
          <SurfaceMaterial id={materialId} surface="walls" />
        </mesh>
      ))}
      {ceilings.map(({ materialId, geometry }) => (
        <mesh key={materialId} geometry={geometry} receiveShadow raycast={noRaycast}>
          <SurfaceMaterial id={materialId} surface="ceiling" />
        </mesh>
      ))}
    </group>
  )
}

/** All rooms, floor by floor: floor slabs, merged walls and ceilings. */
export function Rooms() {
  const rooms = useDesignStore((s) => s.design.rooms)
  const floors = useDesignStore((s) => s.design.floors)
  const byFloor = useMemo(() => {
    const groups = new Map<number, Room[]>()
    for (const room of rooms) groups.set(room.floor, [...(groups.get(room.floor) ?? []), room])
    return [...groups].sort(([a], [b]) => a - b)
  }, [rooms])

  return (
    <>
      {byFloor.map(([floor, floorRooms]) => (
        <FloorRooms key={floor} floor={floor} elevation={elevationOf(floors, floor)} rooms={floorRooms} />
      ))}
    </>
  )
}
