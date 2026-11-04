import { Canvas, type RootState } from '@react-three/fiber'
import { useRef } from 'react'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Quality } from '../types/appSettings'
import { EditorCamera, type CameraState } from './EditorCamera'
import { Connectors } from './Connectors'
import { FishTank } from './FishTank'
import { FpsProbe } from './FpsProbe'
import { Ground } from './Ground'
import { GroundGrid } from './GroundGrid'
import { Lighting } from './Lighting'
import { Lights } from './Lights'
import { OpeningOverlay } from './OpeningOverlay'
import { QUALITY_PRESETS } from './quality'
import { elevationOf } from './workPlane'
import { PieceGizmo } from './PieceGizmo'
import { Pieces } from './Pieces'
import { RoomDraft } from './RoomDrawing'
import { Rooms } from './Rooms'
import { SelectionOverlay } from './SelectionOverlay'

interface ViewportProps {
  quality: Quality
  showFps: boolean
  camera: CameraState
  onCursor: (point: { x: number; z: number } | null) => void
}

// Dev only: lets the console (and browser tests) read the live renderer, camera and controls.
function onCreated(state: RootState) {
  // Connectors are cut off at the top of the floor being edited, with a clipping plane.
  state.gl.localClippingEnabled = true
  exposeForDev(state)
}

function exposeForDev({ get }: RootState) {
  if (import.meta.env.DEV) Object.assign((window as unknown as { __mansion: object }).__mansion ?? {}, { three: get })
}

/**
 * The 3D viewport. A quality change remounts the Canvas (antialiasing can only be
 * chosen when the WebGL context is created); the shared camera state keeps the view.
 */
export function Viewport({ quality, showFps, camera, onCursor }: ViewportProps) {
  const preset = QUALITY_PRESETS[quality]
  const plotSize = useDesignStore((s) => s.design.terrain.size)
  const timeOfDay = useDesignStore((s) => s.design.settings.timeOfDay)
  const tool = useEditorStore((s) => s.tool)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const elevation = useDesignStore((s) => elevationOf(s.design.floors, activeFloor))
  const fps = useRef<HTMLSpanElement>(null)

  const onFps = (value: number) => {
    if (fps.current) fps.current.textContent = String(Math.round(value))
  }

  return (
    <div className={`viewport viewport--${tool}`} data-quality={quality}>
      <Canvas
        key={quality}
        dpr={[1, preset.maxPixelRatio]}
        gl={{ antialias: preset.antialias, powerPreference: 'high-performance' }}
        shadows={preset.shadows ? 'percentage' : false}
        camera={{ fov: 45, near: 0.1, far: 2000, position: camera.position.toArray() }}
        onCreated={onCreated}
      >
        <Lighting shadows={preset.shadows} plotSize={plotSize} timeOfDay={timeOfDay} />
        <Ground plotSize={plotSize} elevation={elevation} onCursor={onCursor} />
        <GroundGrid plotSize={plotSize} elevation={elevation} />
        <Rooms />
        <FishTank caustics={quality === 'high'} />
        <Pieces />
        <Connectors />
        <Lights quality={preset} />
        <PieceGizmo />
        <RoomDraft />
        <SelectionOverlay />
        <OpeningOverlay />
        <EditorCamera state={camera} plotSize={plotSize} floorElevation={elevation} leftButtonOrbits={tool !== 'room'} />
        {showFps && <FpsProbe onSample={onFps} />}
      </Canvas>
      {showFps && (
        <div className="viewport__fps" aria-label="Frames per second">
          <span ref={fps} className="viewport__fps-value">
            –
          </span>{' '}
          fps
        </div>
      )}
    </div>
  )
}
