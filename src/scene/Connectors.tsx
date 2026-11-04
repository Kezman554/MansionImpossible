import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { DoubleSide, Plane, Vector3 } from 'three'
import { MATERIALS } from '../editor/catalog/materials'
import type { ConnectorType } from '../editor/connectors/catalog'
import { connectorFloors, connectorSize, isConnector } from '../editor/connectors/connectors'
import { connectorParts } from '../editor/connectors/geometry'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Floor, Piece, Vec3 } from '../types/design'
import { gizmoHasPointer } from './gizmoState'
import { overlayTokens } from './overlayTokens'
import { CLICK_TOLERANCE_PX, elevationOf } from './workPlane'

const noRaycast = () => null
type Look = { kind: 'solid'; clipTop: number } | { kind: 'ghost' } | { kind: 'preview' }

/** Geometry for one connector at its fitted size; rebuilt only when its shape changes. */
function useParts(type: ConnectorType, size: Vec3, material: string) {
  const key = size.join()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the size array is keyed by value
  const parts = useMemo(() => connectorParts(type, size, material), [type, key, material])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  return parts
}

function selectPiece(e: ThreeEvent<MouseEvent>, piece: Piece) {
  if (useEditorStore.getState().tool !== 'select' || e.delta > CLICK_TOLERANCE_PX || gizmoHasPointer()) return
  e.stopPropagation()
  const store = useDesignStore.getState()
  useEditorStore.getState().selectOpening(null)
  if (e.shiftKey && store.selection.includes(piece.id)) store.select(store.selection.filter((id) => id !== piece.id))
  else store.select(piece.id, { additive: e.shiftKey })
}

/**
 * One connector, drawn in place from its start floor. Solid on the floors it spans, cut off at
 * the top of the floor being edited (floors above are hidden); ghosted from floors above it.
 */
export function ConnectorMesh({ piece, floors, look }: { piece: Pick<Piece, 'type' | 'floor' | 'toFloor' | 'size' | 'position' | 'rotation' | 'material'> & { id?: string }; floors: Floor[]; look: Look }) {
  const type = piece.type as ConnectorType
  const size = connectorSize(piece, floors)
  const parts = useParts(type, size, piece.material ?? 'steel')
  const clipTop = look.kind === 'solid' ? look.clipTop : null
  const clipping = useMemo(() => (clipTop === null ? [] : [new Plane(new Vector3(0, -1, 0), clipTop)]), [clipTop])
  const elevation = elevationOf(floors, connectorFloors(piece).from)

  return (
    <group
      name={look.kind === 'solid' ? 'connector' : `connector-${look.kind}`}
      userData={{ id: piece.id, type }}
      position={[piece.position[0], elevation + piece.position[1], piece.position[2]]}
      rotation={piece.rotation}
      onClick={look.kind === 'solid' && piece.id ? (e) => selectPiece(e, piece as Piece) : undefined}
    >
      {parts.map((part, i) => {
        const spec = MATERIALS[part.material] ?? MATERIALS.steel
        const seeThrough = spec.opacity !== undefined && spec.opacity < 1
        return (
          <mesh key={i} geometry={part.geometry} castShadow={look.kind === 'solid' && !seeThrough} receiveShadow={look.kind === 'solid'} raycast={look.kind === 'solid' ? undefined : noRaycast} renderOrder={look.kind === 'preview' ? 9 : 0}>
            {look.kind === 'solid' ? (
              <meshStandardMaterial
                color={spec.color}
                roughness={spec.roughness}
                transparent={seeThrough}
                opacity={spec.opacity ?? 1}
                depthWrite={!seeThrough}
                side={part.doubleSided || seeThrough ? DoubleSide : undefined}
                clippingPlanes={clipping}
              />
            ) : look.kind === 'ghost' ? (
              <meshBasicMaterial color={overlayTokens.ghost} transparent opacity={0.12} depthWrite={false} toneMapped={false} side={DoubleSide} />
            ) : (
              <meshBasicMaterial color={overlayTokens.selection} transparent opacity={0.3} depthWrite={false} toneMapped={false} side={DoubleSide} />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Vertical connectors (stairs, the elevator, slides, the pole). Each is drawn once, from its
 * lowest floor, whichever of its floors is being edited; hidden while editing a floor below it.
 */
export function Connectors() {
  const pieces = useDesignStore((s) => s.design.pieces)
  const floors = useDesignStore((s) => s.design.floors)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)
  const active = floors.find((f) => f.index === activeFloor)
  const clipTop = elevationOf(floors, activeFloor) + (active?.height ?? 3)

  return (
    <>
      {pieces.filter(isConnector).map((p) => {
        const { from, to } = connectorFloors(p)
        if (activeFloor < from) return null
        if (activeFloor > to) return belowFloors === 'ghost' ? <ConnectorMesh key={p.id} piece={p} floors={floors} look={{ kind: 'ghost' }} /> : null
        return <ConnectorMesh key={p.id} piece={p} floors={floors} look={{ kind: 'solid', clipTop }} />
      })}
    </>
  )
}
