import { useEffect, useRef, useState } from 'react'
import { useEditorShortcuts } from '../editor/editorShortcuts'
import { nearestFloor } from '../editor/floors'
import { DEFAULT_CAMERA } from '../scene/cameraLimits'
import type { CameraState } from '../scene/EditorCamera'
import { Viewport } from '../scene/Viewport'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { useSettingsStore } from '../store/settingsStore'
import { EditorTopBar } from './EditorTopBar'
import { FloorGauge } from './FloorGauge'
import { Inspector } from './Inspector'
import { OpeningTray } from './OpeningTray'
import { PieceTray } from './PieceTray'
import { SaveBanner } from './SaveBanner'
import { SettingsDialog } from './SettingsDialog'
import { StatusBar } from './StatusBar'
import { ToolRail } from './ToolRail'
import './Editor.css'

interface EditorProps {
  onBack: () => void
}

/** The open design: top bar, tool rail, viewport, inspector and status bar (DESIGN.md / canvas C). */
export function Editor({ onBack }: EditorProps) {
  useEditorShortcuts()

  // Each design opens on its ground floor. Afterwards, if an undo or redo takes away the
  // active floor, move to the nearest one that's left.
  useEffect(() => {
    useEditorStore.setState({ activeFloor: 0, selectedOpening: null, openingPreview: null, draft: null, tool: 'select' })
    return useDesignStore.subscribe((state, previous) => {
      if (state.design.floors === previous.design.floors) return
      const editor = useEditorStore.getState()
      const index = nearestFloor(state.design.floors, editor.activeFloor)
      if (index !== editor.activeFloor) editor.setActiveFloor(index)
    })
  }, [])
  const quality = useSettingsStore((s) => s.quality)
  const showFps = useSettingsStore((s) => s.showFps)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // One mutable camera state per open design, shared with the viewport across Canvas remounts.
  const [camera] = useState<CameraState>(() => ({ position: DEFAULT_CAMERA.position.clone(), target: DEFAULT_CAMERA.target.clone() }))
  const cursor = useRef<HTMLSpanElement>(null)

  const onCursor = (point: { x: number; z: number } | null) => {
    if (cursor.current) cursor.current.textContent = point ? `${point.x.toFixed(1)}, ${point.z.toFixed(1)} m` : '–'
  }

  return (
    <div className="editor">
      <EditorTopBar onDesigns={onBack} onSettings={() => setSettingsOpen(true)} />
      <div className="editor__banner">
        <SaveBanner />
      </div>
      <div className="editor__body">
        <ToolRail />
        <main className="editor__viewport">
          <Viewport quality={quality} showFps={showFps} camera={camera} onCursor={onCursor} />
          <FloorGauge />
          <OpeningTray />
          <PieceTray />
        </main>
        <Inspector />
      </div>
      <StatusBar cursorRef={cursor} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
