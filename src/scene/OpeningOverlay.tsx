import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import { openingSpan, type OpeningSpan } from '../editor/openings'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Opening, Room } from '../types/design'
import { overlayTokens } from './overlayTokens'
import { elevationOf } from './workPlane'

/** The opening's outline on both faces of its wall, plus the jamb edges joining them. */
function outline(s: OpeningSpan, depth: number): [number, number, number][][] {
  const point = (along: number, y: number, side: number): [number, number, number] =>
    s.axis === 'x' ? [along, y, s.line + side * depth] : [s.line + side * depth, y, along]
  const loop = (side: number) => [point(s.from, s.bottom, side), point(s.to, s.bottom, side), point(s.to, s.top, side), point(s.from, s.top, side), point(s.from, s.bottom, side)]
  return [loop(-1), loop(1)]
}

function OpeningMarker({ room, opening, ghost }: { room: Room; opening: Opening; ghost: boolean }) {
  const floors = useDesignStore((s) => s.design.floors)
  const s = openingSpan(room, opening)
  const depth = room.wallThickness / 2 + 0.01
  const mid = { along: (s.from + s.to) / 2, y: (s.bottom + s.top) / 2 }

  return (
    <group position-y={elevationOf(floors, room.floor)}>
      {outline(s, depth).map((points, i) => (
        <Line key={i} points={points} color={overlayTokens.selection} lineWidth={ghost ? 1.5 : 2.5} dashed={ghost} dashSize={0.15} gapSize={0.1} depthTest={false} renderOrder={10} />
      ))}
      {ghost && (
        <mesh
          position={s.axis === 'x' ? [mid.along, mid.y, s.line] : [s.line, mid.y, mid.along]}
          rotation-y={s.axis === 'x' ? 0 : Math.PI / 2}
          renderOrder={9}
          raycast={() => null}
        >
          <planeGeometry args={[s.to - s.from, s.top - s.bottom]} />
          <meshBasicMaterial color={overlayTokens.selection} transparent opacity={0.25} depthTest={false} depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** Where the door or window tool would place an opening (dashed), and the selected opening (solid). */
export function OpeningOverlay() {
  const preview = useEditorStore((s) => s.openingPreview)
  const selected = useEditorStore((s) => s.selectedOpening)
  const rooms = useDesignStore((s) => s.design.rooms)

  const previewRoom = preview && rooms.find((r) => r.id === preview.roomId)
  const selectedRoom = selected && rooms.find((r) => r.id === selected.roomId)
  const selectedOpening = selectedRoom?.openings.find((o) => o.id === selected?.openingId)

  return (
    <>
      {previewRoom && preview && <OpeningMarker room={previewRoom} opening={preview.opening} ghost />}
      {selectedRoom && selectedOpening && <OpeningMarker room={selectedRoom} opening={selectedOpening} ghost={false} />}
    </>
  )
}
