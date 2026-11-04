import { useEffect, useMemo } from 'react'
import { BoxGeometry, PlaneGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { screenPanels, type ScreenPanel } from '../editor/roundRoom'
import type { Room } from '../types/design'
import { useImageMaterial } from './imageTextures'
import { NO_CUSTOM, sharedMaterialById } from './materialCache'

/** Panels stand from just above the floor to just under the ceiling. */
const GAP = { bottom: 0.03, top: 0.02 }
const FRAME_DEPTH = 0.05
const BEZEL = 0.04

/** The way a panel faces: towards the room's centre. */
const facing = (room: Room, p: ScreenPanel) => Math.atan2(room.position[0] - p.x, room.position[2] - p.z)

/** One screen's picture: its library image (unlit), or dark glass when none is set. */
function Display({ room, panel, imageId, height }: { room: Room; panel: ScreenPanel; imageId: string | null; height: number }) {
  const picture = useImageMaterial(imageId)
  const blank = sharedMaterialById('screen-off', NO_CUSTOM, 'charcoal')
  const geometry = useMemo(() => new PlaneGeometry(panel.width - 2 * BEZEL, height - 2 * BEZEL), [panel.width, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      name="screen"
      userData={{ roomId: room.id, index: panel.index, imageId, showing: !!picture }}
      geometry={geometry}
      material={picture ?? blank}
      position={[panel.x, GAP.bottom + height / 2, panel.z]}
      rotation-y={facing(room, panel)}
    />
  )
}

/**
 * Floor-to-ceiling screens round a round room's wall: one merged frame for all of them and a
 * display per screen (screens showing the same image share its texture and material).
 */
export function ScreenPanels({ room }: { room: Room }) {
  const panels = useMemo(() => screenPanels(room), [room])
  const height = room.size[1] - GAP.bottom - GAP.top
  const frames = useMemo<BufferGeometry | null>(() => {
    if (!panels.length) return null
    const parts = panels.map((p) => new BoxGeometry(p.width, height, FRAME_DEPTH).translate(0, 0, -FRAME_DEPTH / 2 - 0.002).rotateY(facing(room, p)).translate(p.x, GAP.bottom + height / 2, p.z))
    const merged = mergeGeometries(parts)
    parts.forEach((g) => g.dispose())
    return merged
  }, [panels, height, room])
  useEffect(() => () => frames?.dispose(), [frames])
  if (!frames) return null
  return (
    <group name="screens" userData={{ roomId: room.id, count: panels.length }}>
      <mesh name="screen-frames" geometry={frames} material={sharedMaterialById('charcoal', NO_CUSTOM, 'charcoal')} castShadow receiveShadow />
      {panels.map((p) => (
        <Display key={p.index} room={room} panel={p} imageId={room.screens?.images[p.index] ?? null} height={height} />
      ))}
    </group>
  )
}
