import { useDesignStore } from '../store/designStore'
import type { Floor, Room } from '../types/design'

// Plain stand-in geometry so a design's rooms, pieces and furniture are visible
// (and cast shadows) until the real room, piece and furniture builders replace it.

const WALL = 0.2
const SLAB = 0.1
const FURNITURE_SIZE = 0.8
const DEFAULT_STOREY = 3

function elevationOf(floors: Floor[], index: number): number {
  return floors.find((f) => f.index === index)?.elevation ?? index * DEFAULT_STOREY
}

function RoomShell({ room }: { room: Room }) {
  const [w, h, d] = room.size
  const walls: [number, number, number, number, number][] = [
    [0, h / 2, -d / 2, w + WALL, WALL],
    [0, h / 2, d / 2, w + WALL, WALL],
    [-w / 2, h / 2, 0, WALL, d],
    [w / 2, h / 2, 0, WALL, d],
  ]
  return (
    <>
      <mesh position-y={SLAB / 2} receiveShadow castShadow>
        <boxGeometry args={[w, SLAB, d]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>
      {walls.map(([x, y, z, sx, sz], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[sx, h, sz]} />
          <meshStandardMaterial roughness={0.9} />
        </mesh>
      ))}
    </>
  )
}

export function PlaceholderObjects() {
  const { floors, rooms, pieces, furniture } = useDesignStore((s) => s.design)

  return (
    <>
      {rooms.map((room) => (
        <group key={room.id} position={[room.position[0], room.position[1] + elevationOf(floors, room.floor), room.position[2]]} rotation={room.rotation} scale={room.scale}>
          <RoomShell room={room} />
        </group>
      ))}
      {pieces.map((piece) => (
        <mesh
          key={piece.id}
          position={[piece.position[0], piece.position[1] + elevationOf(floors, piece.floor) + (piece.size[1] * piece.scale[1]) / 2, piece.position[2]]}
          rotation={piece.rotation}
          scale={piece.scale}
          castShadow
          receiveShadow
        >
          <boxGeometry args={piece.size} />
          <meshStandardMaterial roughness={0.6} />
        </mesh>
      ))}
      {furniture.map((item) => (
        <mesh
          key={item.id}
          position={[item.position[0], item.position[1] + elevationOf(floors, item.floor) + (FURNITURE_SIZE * item.scale[1]) / 2, item.position[2]]}
          rotation={item.rotation}
          scale={item.scale}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[FURNITURE_SIZE, FURNITURE_SIZE, FURNITURE_SIZE]} />
          <meshStandardMaterial roughness={0.7} />
        </mesh>
      ))}
    </>
  )
}
