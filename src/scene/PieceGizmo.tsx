import { TransformControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useRef, type ComponentRef, type RefObject } from 'react'
import { Euler, Vector3, type Color, type Group, type Object3D } from 'three'
import { pieceFromTransform, ROTATION_SNAP_DEGREES, SIZE_SNAP, snapTo } from '../editor/freeform/pieces'
import { isConnector, pieceOnFloor } from '../editor/connectors/connectors'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Euler3, Light, Piece, Vec3 } from '../types/design'
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
  pieces: (Piece | Light)[]
  proxyStart: Vector3
  checkpointed: boolean
}

/** A connector keeps its fitted size and stays on its floor; the gizmo only moves and turns it. */
function connectorPatch(piece: Piece, patch: Partial<Piece>): Partial<Piece> {
  if (!isConnector(piece)) return patch
  return { position: [patch.position![0], 0, patch.position![2]], rotation: [0, patch.rotation![1], 0] }
}

type Movable = Piece | Light

/** A light from the gizmo: position back on its floor (snapped), and its turn (spotlights also tilt). */
function lightPatch(light: Light, position: Vector3, rotation: Euler, elevation: number, snap: number | null): Partial<Light> {
  const r = (v: number) => Math.round(v * 1000) / 1000
  const s = (v: number) => (snap ? snapTo(v, snap) : r(v))
  const angle = (v: number) => (snap ? snapTo(v, (ROTATION_SNAP_DEGREES * Math.PI) / 180) : r(v))
  const turn: Euler3 = light.type === 'spot' ? [angle(rotation.x), angle(rotation.y), angle(rotation.z)] : [0, angle(rotation.y), 0]
  return { position: [s(position.x), r(position.y - elevation), s(position.z)], rotation: turn }
}

/**
 * The transform gizmo on the selected pieces and lights (on the active floor). It drives an invisible
 * proxy object; changes are written back to the pieces as the gizmo moves — one undo step per
 * drag. One piece: move, rotate or scale (scale changes its size). Several: move them together.
 */
export function PieceGizmo() {
  const selection = useDesignStore((s) => s.selection)
  const pieces = useDesignStore((s) => s.design.pieces)
  const lights = useDesignStore((s) => s.design.lights)
  const floors = useDesignStore((s) => s.design.floors)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const tool = useEditorStore((s) => s.tool)
  const mode = useEditorStore((s) => s.gizmoMode)
  const snapOn = useDesignStore((s) => s.design.settings.snapToGrid)
  const gridSize = useDesignStore((s) => s.design.settings.gridSize)

  const proxy = useRef<Group>(null)
  const drag = useRef<Drag | null>(null)
  const controls = useRef<ComponentRef<typeof TransformControls>>(null)
  // Pieces and lights move alike (lights only on the floor being edited: floors above are hidden).
  const selected: Movable[] = [
    ...pieces.filter((p) => pieceOnFloor(p, activeFloor) && selection.includes(p.id)),
    ...(lights ?? []).filter((l) => l.floor === activeFloor && selection.includes(l.id)),
  ]
  const single = selected.length === 1 ? selected[0] : null
  // Connectors stand on their lowest floor, which may be below the one being edited.
  const elevation = elevationOf(floors, (single ?? selected[0])?.floor ?? activeFloor)
  // Connectors stay on the floor, turn only about the vertical and are sized by their floors.
  const connector = selected.some((o) => o.kind === 'piece' && isConnector(o))
  // Lights have no size to scale; only spotlights tilt, the rest just turn about the vertical.
  const light = selected.some((o) => o.kind === 'light')
  const gizmoMode = single && !((connector || light) && mode === 'scale') ? mode : 'translate'
  const turnOnly = connector || (single?.kind === 'light' && single.type !== 'spot')

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
    const one = d.pieces.length === 1 ? d.pieces[0] : null
    const updates: [string, Partial<Piece> | Partial<Light>][] = one
      ? [[one.id, one.kind === 'light' ? lightPatch(one, g.position, new Euler().copy(g.rotation), elevation, snap) : connectorPatch(one, pieceFromTransform(g.position, new Euler().copy(g.rotation), g.scale, one, elevation, snap))]]
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
        mode={gizmoMode}
        space={single && gizmoMode !== 'translate' ? 'local' : 'world'}
        showY={!(connector && gizmoMode === 'translate')}
        showX={!(turnOnly && gizmoMode === 'rotate')}
        showZ={!(turnOnly && gizmoMode === 'rotate')}
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
