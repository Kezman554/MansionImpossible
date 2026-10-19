import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, DoubleSide, EdgesGeometry, Matrix4, type InstancedMesh, type LineSegments } from 'three'
import { MATERIALS } from '../editor/catalog/materials'
import { DOUBLE_SIDED, pieceGeometry } from '../editor/freeform/geometry'
import { groupForInstancing, pieceMatrix } from '../editor/freeform/pieces'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Piece, PieceType } from '../types/design'
import { overlayTokens } from './overlayTokens'
import { gizmoHasPointer } from './gizmoState'
import { usePiecePlacement } from './usePiecePlacement'
import { CLICK_TOLERANCE_PX, elevationOf } from './workPlane'

const _matrix = new Matrix4()
const noRaycast = () => null

interface InstancedPiecesProps {
  type: PieceType
  material: string | null
  pieces: Piece[]
  elevation: number
  ghost: boolean
}

/**
 * Every piece of one shape and material on a floor, as a single instanced mesh: one draw
 * call however many there are. Instance i is pieces[i].
 */
function InstancedPieces({ type, material, pieces, elevation, ghost }: InstancedPiecesProps) {
  const mesh = useRef<InstancedMesh>(null)
  const placement = usePiecePlacement()
  const spec = MATERIALS[material ?? ''] ?? MATERIALS.plaster
  const seeThrough = spec.opacity !== undefined && spec.opacity < 1

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    pieces.forEach((p, i) => m.setMatrixAt(i, pieceMatrix(p, elevation, _matrix)))
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    m.computeBoundingBox()
  }, [pieces, elevation])

  const pieceAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : pieces[e.instanceId])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (placement.onClick(e, true)) return
    if (useEditorStore.getState().tool !== 'select' || e.delta > CLICK_TOLERANCE_PX || gizmoHasPointer()) return
    const piece = pieceAt(e)
    if (!piece) return
    e.stopPropagation()
    const store = useDesignStore.getState()
    useEditorStore.getState().selectOpening(null)
    // Shift-click adds to the selection, or takes a piece out of it.
    if (e.shiftKey && store.selection.includes(piece.id)) store.select(store.selection.filter((id) => id !== piece.id))
    else store.select(piece.id, { additive: e.shiftKey })
  }

  return (
    <instancedMesh
      key={pieces.length}
      ref={mesh}
      name={ghost ? 'ghost-pieces' : 'pieces'}
      userData={{ type, count: pieces.length }}
      args={[pieceGeometry(type), undefined, pieces.length]}
      castShadow={!ghost && !seeThrough}
      receiveShadow={!ghost && !seeThrough}
      raycast={ghost ? noRaycast : undefined}
      onClick={ghost ? undefined : onClick}
      onPointerMove={ghost ? undefined : (e) => placement.onPointerMove(e, true)}
    >
      {ghost ? (
        <meshBasicMaterial color={overlayTokens.ghost} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      ) : (
        <meshStandardMaterial
          color={spec.color}
          roughness={spec.roughness}
          transparent={seeThrough}
          opacity={spec.opacity ?? 1}
          depthWrite={!seeThrough}
          side={seeThrough || DOUBLE_SIDED.has(type) ? DoubleSide : undefined}
        />
      )}
    </instancedMesh>
  )
}

const UNIT_EDGES = new EdgesGeometry(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0))

/** A coral box round a piece: selected pieces, and the piece the freeform tool would place. */
function PieceBox({ piece, elevation, dashed = false }: { piece: Pick<Piece, 'position' | 'rotation' | 'scale' | 'size'>; elevation: number; dashed?: boolean }) {
  const lines = useRef<LineSegments>(null)
  useLayoutEffect(() => {
    const l = lines.current
    if (!l) return
    pieceMatrix(piece, elevation, l.matrix)
    l.matrixWorldNeedsUpdate = true
    if (dashed) l.computeLineDistances()
  }, [piece, elevation, dashed])

  return (
    <lineSegments ref={lines} geometry={UNIT_EDGES} matrixAutoUpdate={false} renderOrder={10} raycast={noRaycast}>
      {dashed ? (
        <lineDashedMaterial color={overlayTokens.selection} dashSize={0.02} gapSize={0.02} depthTest={false} toneMapped={false} />
      ) : (
        <lineBasicMaterial color={overlayTokens.selection} depthTest={false} toneMapped={false} />
      )}
    </lineSegments>
  )
}

/** The freeform tool's preview: the piece's shape, translucent coral, inside a dashed box. */
function PlacementPreview({ elevation }: { elevation: number }) {
  const preview = useEditorStore((s) => s.piecePreview)
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!mesh.current || !preview) return
    mesh.current.setMatrixAt(0, pieceMatrix(preview, elevation, _matrix))
    mesh.current.instanceMatrix.needsUpdate = true
  }, [preview, elevation])
  if (!preview) return null
  return (
    <>
      <instancedMesh key={preview.type} ref={mesh} args={[pieceGeometry(preview.type), undefined, 1]} raycast={noRaycast} renderOrder={9}>
        <meshBasicMaterial color={overlayTokens.selection} transparent opacity={0.3} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </instancedMesh>
      <PieceBox piece={preview} elevation={elevation} dashed />
    </>
  )
}

/**
 * Freeform pieces, floor by floor, drawn with instancing. Like rooms: the active floor is
 * solid and interactive, floors above are hidden, floors below are ghosted or hidden.
 */
export function Pieces() {
  const pieces = useDesignStore((s) => s.design.pieces)
  const floors = useDesignStore((s) => s.design.floors)
  const selection = useDesignStore((s) => s.selection)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)

  const layers = useMemo(() => {
    const byFloor = new Map<number, Piece[]>()
    for (const p of pieces) byFloor.set(p.floor, [...(byFloor.get(p.floor) ?? []), p])
    return [...byFloor].filter(([floor]) => floor === activeFloor || (floor < activeFloor && belowFloors === 'ghost'))
  }, [pieces, activeFloor, belowFloors])

  const activeElevation = elevationOf(floors, activeFloor)
  const selected = pieces.filter((p) => p.floor === activeFloor && selection.includes(p.id))

  return (
    <>
      {layers.map(([floor, floorPieces]) =>
        groupForInstancing(floorPieces).map((group) => (
          <InstancedPieces
            key={`${floor}|${group.key}`}
            type={group.type}
            material={group.material}
            pieces={group.pieces}
            elevation={elevationOf(floors, floor)}
            ghost={floor !== activeFloor}
          />
        )),
      )}
      {selected.map((p) => (
        <PieceBox key={p.id} piece={p} elevation={activeElevation} />
      ))}
      <PlacementPreview elevation={activeElevation} />
    </>
  )
}
