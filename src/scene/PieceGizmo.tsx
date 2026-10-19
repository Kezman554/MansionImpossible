import { TransformControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useRef, type ComponentRef, type RefObject } from 'react'
import { Euler, Vector3, type Color, type Group, type Object3D } from 'three'
import { pieceFromTransform, ROTATION_SNAP_DEGREES, SIZE_SNAP, snapTo } from '../editor/freeform/pieces'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Piece, Vec3 } from '../types/design'
import { gizmoState } from './gizmoState'
import { overlayTokens } from './overlayTokens'
import { pieceSnap } from './usePiecePlacement'
import { elevationOf } from './workPlane'

/** Handle name → DESIGN.md gizmo colour. Plane handles take the colour of the axis they're perpendicular to. */
const HANDLE_COLOURS: Record<string, string> = {
  X: overlayTokens.gizmo.x,
  Y: overlayTokens.gizmo.y,
  Z: overlayTokens.gizmo.z,
  YZ: overlayTokens.gizmo.x,
  XZ: overlayTokens.gizmo.y,
  XY: overlayTokens.gizmo.z,
}

/** Swaps the gizmo's stock red/green/blue for the design's gizmo colours (and the copy it restores from after a hover). */
function recolourGizmo(root: Object3D) {
  root.traverse((o) => {
    const colour = HANDLE_COLOURS[o.name]
    const material = (o as Object3D & { material?: { color?: Color; _color?: Color } }).material
    if (!colour || !material?.color) return
    material.color.set(colour)
    material._color?.set(colour)
  })
}

interface Drag {
  pieces: Piece[]
  proxyStart: Vector3
  checkpointed: boolean
}

/**
 * The transform gizmo on the selected pieces (on the active floor). It drives an invisible
 * proxy object; changes are written back to the pieces as the gizmo moves — one undo step per
 * drag. One piece: move, rotate or scale (scale changes its size). Several: move them together.
 */
export function PieceGizmo() {
  const selection = useDesignStore((s) => s.selection)
  const pieces = useDesignStore((s) => s.design.pieces)
  const floors = useDesignStore((s) => s.design.floors)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const tool = useEditorStore((s) => s.tool)
  const mode = useEditorStore((s) => s.gizmoMode)
  const snapOn = useDesignStore((s) => s.design.settings.snapToGrid)
  const gridSize = useDesignStore((s) => s.design.settings.gridSize)

  const proxy = useRef<Group>(null)
  const drag = useRef<Drag | null>(null)
  const controls = useRef<ComponentRef<typeof TransformControls>>(null)
  const selected = pieces.filter((p) => p.floor === activeFloor && selection.includes(p.id))
  const elevation = elevationOf(floors, activeFloor)
  const single = selected.length === 1 ? selected[0] : null

  // Park the proxy on the selection whenever the pieces change outside a drag (undo, inspector…).
  useLayoutEffect(() => {
    const g = proxy.current
    if (!g || drag.current || selected.length === 0) return
    if (single) {
      g.position.set(single.position[0], single.position[1] + elevation, single.position[2])
      g.rotation.set(...single.rotation)
    } else {
      const centre = selected.reduce((sum, p) => sum.add(new Vector3(...p.position)), new Vector3()).divideScalar(selected.length)
      g.position.set(centre.x, centre.y + elevation, centre.z)
      g.rotation.set(0, 0, 0)
    }
    g.scale.set(1, 1, 1)
  })

  const visible = selected.length > 0 && (tool === 'select' || tool === 'freeform')
  useEffect(() => {
    if (visible && controls.current) recolourGizmo(controls.current as unknown as Object3D)
  }, [visible])
  // A hidden gizmo has no handle under the pointer.
  useEffect(() => {
    if (!visible) gizmoState.axis = null
  }, [visible])
  if (!visible) return null

  const onMouseDown = () => {
    if (!proxy.current) return
    drag.current = { pieces: selected, proxyStart: proxy.current.position.clone(), checkpointed: false }
    useEditorStore.getState().setDragging(true)
  }

  const onObjectChange = () => {
    const d = drag.current
    const g = proxy.current
    if (!d || !g) return
    const store = useDesignStore.getState()
    const snap = pieceSnap()
    const updates: [string, Partial<Piece>][] =
      d.pieces.length === 1
        ? [[d.pieces[0].id, pieceFromTransform(g.position, new Euler().copy(g.rotation), g.scale, d.pieces[0], elevation, snap)]]
        : d.pieces.map((p) => {
            const delta = g.position.clone().sub(d.proxyStart)
            const move = (v: number, dv: number) => (snap ? snapTo(v + dv, snap) : Math.round((v + dv) * 1000) / 1000)
            return [p.id, { position: [move(p.position[0], delta.x), Math.round((p.position[1] + delta.y) * 1000) / 1000, move(p.position[2], delta.z)] as Vec3 }]
          })
    if (!d.checkpointed) {
      store.checkpoint()
      d.checkpointed = true
    }
    for (const [id, patch] of updates) store.updateObject(id, patch, { record: false })
  }

  const onMouseUp = () => {
    drag.current = null
    useEditorStore.getState().setDragging(false)
    if (proxy.current) proxy.current.scale.set(1, 1, 1)
  }

  return (
    <>
      <group ref={proxy} name="gizmo-proxy" />
      <TransformControls
        ref={controls}
        object={proxy as RefObject<Group>}
        // axis is public at runtime (the hovered handle), only typed private in three-stdlib.
        onChange={() => (gizmoState.axis = (controls.current as unknown as { axis: string | null } | null)?.axis ?? null)}
        mode={single ? mode : 'translate'}
        space={single && mode !== 'translate' ? 'local' : 'world'}
        translationSnap={snapOn ? gridSize : null}
        rotationSnap={snapOn ? (ROTATION_SNAP_DEGREES * Math.PI) / 180 : null}
        scaleSnap={snapOn ? SIZE_SNAP : null}
        size={0.9}
        onMouseDown={onMouseDown}
        onObjectChange={onObjectChange}
        onMouseUp={onMouseUp}
      />
    </>
  )
}
