import { Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { HANDLES, handlePoint, placementFromRect, resizeRect, roomRect, type Handle, type Rect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Room } from '../types/design'
import { overlayTokens } from './overlayTokens'
import { elevationOf, pointAtHeight } from './workPlane'

const HANDLE_SCREEN_SIZE = 0.016 // fraction of camera distance, so handles stay a similar size on screen
const worldPosition = new Vector3()
const CURSORS: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }

const outline = (r: Rect, y: number): [number, number, number][] => [
  [r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], [r.x0, y, r.z0],
]

interface ResizeDrag {
  handle: Handle
  rect: Rect
  checkpointed: boolean
}

function RoomSelection({ room, elevation }: { room: Room; elevation: number }) {
  const rect = roomRect(room)
  const top = room.size[1] + 0.01
  const camera = useThree((s) => s.camera)
  const handles = useRef<Group>(null)
  // Read live from R3F in handlers: the orbit controls are switched off while dragging.
  const get = useThree((s) => s.get)
  const setOrbit = (enabled: boolean) => {
    const controls = get().controls as { enabled: boolean } | null
    if (controls) controls.enabled = enabled
  }
  const setCursor = (cursor: string) => {
    get().gl.domElement.style.cursor = cursor
  }
  const drag = useRef<ResizeDrag | null>(null)

  useFrame(() => {
    const g = handles.current
    if (!g) return
    for (const child of g.children) child.scale.setScalar(Math.max(0.15, camera.position.distanceTo(child.getWorldPosition(worldPosition)) * HANDLE_SCREEN_SIZE))
  })

  const onDown = (handle: Handle) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    drag.current = { handle, rect, checkpointed: false }
    setOrbit(false)
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    if (!d) return
    e.stopPropagation()
    const p = pointAtHeight(e.ray, elevation + top)
    if (!p) return
    const next = placementFromRect(resizeRect(d.rect, d.handle, p), room.size[1], room.position[1])
    const store = useDesignStore.getState()
    const current = store.design.rooms.find((r) => r.id === room.id)
    if (!current || (next.position.every((v, i) => v === current.position[i]) && next.size.every((v, i) => v === current.size[i]))) return
    if (!d.checkpointed) {
      store.checkpoint()
      d.checkpointed = true
      useEditorStore.getState().setDragging(true)
    }
    store.updateObject(room.id, next, { record: false })
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    drag.current = null
    setOrbit(true)
    useEditorStore.getState().setDragging(false)
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <group position-y={elevation}>
      <Line points={outline(rect, 0.03)} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} />
      <Line points={outline(rect, top)} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} />
      <group ref={handles}>
        {HANDLES.map((handle) => {
          const p = handlePoint(rect, handle)
          return (
            <mesh
              key={handle}
              name={`handle-${handle}`}
              position={[p.x, top, p.z]}
              renderOrder={11}
              onPointerDown={onDown(handle)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerOver={(e) => {
                e.stopPropagation()
                setCursor(CURSORS[handle])
              }}
              onPointerOut={() => !drag.current && setCursor('')}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color={overlayTokens.selection} depthTest={false} toneMapped={false} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

/**
 * Coral outline on selected rooms; resize handles on a single selected room, with the
 * select tool only (with the room tool, a new room's corner must not grab the last one's handle).
 */
export function SelectionOverlay() {
  const selection = useDesignStore((s) => s.selection)
  const editing = useEditorStore((s) => s.tool === 'select')
  const rooms = useDesignStore((s) => s.design.rooms)
  const floors = useDesignStore((s) => s.design.floors)
  const selectedRooms = rooms.filter((r) => selection.includes(r.id))

  return (
    <>
      {selectedRooms.map((room) =>
        selectedRooms.length === 1 && editing ? (
          <RoomSelection key={room.id} room={room} elevation={elevationOf(floors, room.floor)} />
        ) : (
          <group key={room.id} position-y={elevationOf(floors, room.floor)}>
            <Line points={outline(roomRect(room), room.size[1] + 0.01)} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} />
          </group>
        ),
      )}
    </>
  )
}
