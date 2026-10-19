import { useRef, useState } from 'react'
import { useEditorShortcuts } from '../editor/editorShortcuts'
import { DEFAULT_CAMERA } from '../scene/cameraLimits'
import type { CameraState } from '../scene/EditorCamera'
import { Viewport } from '../scene/Viewport'
import { useSettingsStore } from '../store/settingsStore'
import { EditorTopBar } from './EditorTopBar'
import { Inspector } from './Inspector'
import { OpeningTray } from './OpeningTray'
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
          <OpeningTray />
        </main>
        <Inspector />
      </div>
      <StatusBar cursorRef={cursor} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
