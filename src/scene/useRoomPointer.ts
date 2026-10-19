import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { alongWall, fitOpening, newOpening, openingAtPoint, OPENING_SNAP, wallAtPoint, wallOf, type WallLine } from '../editor/openings'
import { moveRect, placementFromRect, roomAtPoint, roomRect, type Rect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Opening, Room } from '../types/design'
import { CLICK_TOLERANCE_PX, pointAtHeight } from './workPlane'

interface MoveDrag {
  kind: 'move'
  roomId: string
  start: { x: number; z: number }
  rect: Rect
  height: number
  checkpointed: boolean
}

interface SlideDrag {
  kind: 'slide'
  roomId: string
  openingId: string
  wall: WallLine
  /** Height of the plane the pointer is tracked on: the middle of the opening. */
  height: number
  startAlong: number
  startOffset: number
  checkpointed: boolean
}

const snap = (v: number) => Math.round(v / OPENING_SNAP) * OPENING_SNAP

/** Records one undo step the first time a drag actually changes something. */
function beginChange(d: { checkpointed: boolean }) {
  if (d.checkpointed) return
  useDesignStore.getState().checkpoint()
  d.checkpointed = true
  useEditorStore.getState().setDragging(true)
}

/**
 * Pointer handling for one floor's rooms:
 * - select tool: click selects a room or an opening; drag a selected room to move it,
 *   drag a selected opening to slide it along its wall
 * - door / window tools: hover a wall to preview, click to place
 * (the room tool draws on the ground, so rooms let its events through)
 */
export function useRoomPointer(floor: number, elevation: number, rooms: Room[]) {
  const get = useThree((s) => s.get)
  const drag = useRef<MoveDrag | SlideDrag | null>(null)

  const setOrbit = (enabled: boolean) => {
    const controls = get().controls as { enabled: boolean } | null
    if (controls) controls.enabled = enabled
  }
  const setCursor = (cursor: string) => {
    get().gl.domElement.style.cursor = cursor
  }
  const tool = () => useEditorStore.getState().tool
  const local = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y - elevation, z: p.z })
  const openingUnder = (e: ThreeEvent<PointerEvent | MouseEvent>) => openingAtPoint(rooms, floor, local(e.point))
  const roomUnder = (e: ThreeEvent<PointerEvent | MouseEvent>) => roomAtPoint(rooms, floor, e.point.x, e.point.z)

  /** Where the door or window tool would place an opening, from the wall hit under the pointer. */
  const placementAt = (e: ThreeEvent<PointerEvent | MouseEvent>): { roomId: string; opening: Opening } | null => {
    const hit = e.intersections.find((i) => i.object.name === 'walls')
    if (!hit) return null
    const p = { x: hit.point.x, z: hit.point.z }
    const candidates = rooms.filter((r) => r.floor === floor && wallAtPoint(r, p))
    if (candidates.length === 0) return null
    // On a shared wall, the opening belongs to the room on the side being looked at.
    const n = hit.face?.normal
    const probe = n ? { x: p.x + n.x * 0.4, z: p.z + n.z * 0.4 } : p
    const room =
      candidates.find((r) => {
        const rect = roomRect(r)
        return probe.x > rect.x0 && probe.x < rect.x1 && probe.z > rect.z0 && probe.z < rect.z1
      }) ?? candidates[0]
    const wall = wallAtPoint(room, p)
    if (!wall) return null
    return { roomId: room.id, opening: newOpening(useEditorStore.getState().openingStyle, room, wall.side, wall.along) }
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    if (tool() === 'door' || tool() === 'window') {
      if (placementAt(e)) e.stopPropagation()
      return
    }
    if (tool() !== 'select') return
    // Resize handles draw on top of walls, so they win even when a wall is nearer.
    if (e.intersections.some((i) => i.object.name.startsWith('handle-'))) return

    const hitOpening = openingUnder(e)
    const selected = useEditorStore.getState().selectedOpening
    if (hitOpening) {
      e.stopPropagation()
      if (selected?.openingId !== hitOpening.opening.id) return // first click selects (onClick)
      const s = hitOpening.opening
      const wall = wallOf(roomRect(hitOpening.room), s.wall)
      const height = elevation + s.sill + s.height / 2
      const p = pointAtHeight(e.ray, height)
      if (!p) return
      drag.current = { kind: 'slide', roomId: hitOpening.room.id, openingId: s.id, wall, height, startAlong: alongWall(wall, p), startOffset: s.offset, checkpointed: false }
    } else {
      const room = roomUnder(e)
      if (!room) return
      e.stopPropagation()
      if (!useDesignStore.getState().selection.includes(room.id)) return
      const start = pointAtHeight(e.ray, elevation)
      if (!start) return
      drag.current = { kind: 'move', roomId: room.id, start, rect: roomRect(room), height: room.size[1], checkpointed: false }
    }
    setOrbit(false)
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    const store = useDesignStore.getState()

    if (!d) {
      if (tool() === 'door' || tool() === 'window') {
        const preview = placementAt(e)
        const current = useEditorStore.getState().openingPreview
        if (preview?.roomId !== current?.roomId || preview?.opening.wall !== current?.opening.wall || preview?.opening.offset !== current?.opening.offset) {
          useEditorStore.getState().setOpeningPreview(preview)
        }
        setCursor(preview ? 'copy' : 'not-allowed')
      } else if (tool() === 'select') {
        const o = openingUnder(e)
        const room = o ? null : roomUnder(e)
        const selectedOpening = useEditorStore.getState().selectedOpening
        setCursor(o ? (selectedOpening?.openingId === o.opening.id ? 'ew-resize' : 'pointer') : room ? (store.selection.includes(room.id) ? 'move' : 'pointer') : '')
      }
      return
    }

    const current = store.design.rooms.find((r) => r.id === d.roomId)
    if (!current) return
    if (d.kind === 'move') {
      const p = pointAtHeight(e.ray, elevation)
      if (!p) return
      const next = placementFromRect(moveRect(d.rect, p.x - d.start.x, p.z - d.start.z), d.height, current.position[1])
      if (next.position[0] === current.position[0] && next.position[2] === current.position[2]) return
      beginChange(d)
      store.updateObject(d.roomId, { position: next.position }, { record: false })
    } else {
      const p = pointAtHeight(e.ray, d.height)
      const opening = current.openings.find((o) => o.id === d.openingId)
      if (!p || !opening) return
      const offset = snap(d.startOffset + alongWall(d.wall, p) - d.startAlong)
      const moved = fitOpening({ ...opening, offset }, current, d.wall.length)
      if (moved.offset === opening.offset) return
      beginChange(d)
      store.updateObject(d.roomId, { openings: current.openings.map((o) => (o.id === d.openingId ? moved : o)) }, { record: false })
    }
  }

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    drag.current = null
    setOrbit(true)
    useEditorStore.getState().setDragging(false)
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return
    const store = useDesignStore.getState()
    const editor = useEditorStore.getState()

    if (tool() === 'door' || tool() === 'window') {
      const placed = placementAt(e)
      if (!placed) return
      e.stopPropagation()
      const room = store.design.rooms.find((r) => r.id === placed.roomId)
      if (!room) return
      store.updateObject(room.id, { openings: [...room.openings, placed.opening] })
      store.clearSelection()
      editor.selectOpening({ roomId: room.id, openingId: placed.opening.id })
      return
    }
    if (tool() !== 'select') return

    const hitOpening = openingUnder(e)
    if (hitOpening) {
      e.stopPropagation()
      store.clearSelection()
      editor.selectOpening({ roomId: hitOpening.room.id, openingId: hitOpening.opening.id })
      return
    }
    const room = roomUnder(e)
    if (!room) return
    e.stopPropagation()
    editor.selectOpening(null)
    store.select(room.id, { additive: e.shiftKey })
  }

  const onPointerOut = () => {
    if (drag.current) return
    setCursor('')
    if (useEditorStore.getState().openingPreview) useEditorStore.getState().setOpeningPreview(null)
  }

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onPointerOut, onClick }
}
