import { useAppStore } from '../store/appStore'
import { useDesignStore } from '../store/designStore'
import { useSettingsStore } from '../store/settingsStore'
import { RedoIcon, SettingsIcon, UndoIcon } from './icons'
import { QUALITY_SEGMENTS } from './qualitySegments'
import { SegmentedControl, type Segment } from './SegmentedControl'

type ViewMode = 'orbit' | 'first-person' | 'tour' | 'dollhouse'

const VIEW_MODES: Segment<ViewMode>[] = [
  { value: 'orbit', label: 'Orbit' },
  { value: 'first-person', label: 'First-person', disabled: true },
  { value: 'tour', label: 'Tour', disabled: true },
  { value: 'dollhouse', label: 'Dollhouse', disabled: true },
]

interface EditorTopBarProps {
  onDesigns: () => void
  onSettings: () => void
}

export function EditorTopBar({ onDesigns, onSettings }: EditorTopBarProps) {
  const name = useDesignStore((s) => s.design.name)
  const canUndo = useDesignStore((s) => s.past.length > 0)
  const canRedo = useDesignStore((s) => s.future.length > 0)
  const unsaved = useAppStore((s) => s.saveProblem !== null)
  const quality = useSettingsStore((s) => s.quality)

  return (
    <header className="editor-bar">
      <div className="editor-bar__name">
        <span className="editor-bar__title">{name}</span>
        {unsaved ? <span className="editor-bar__status editor-bar__status--unsaved">· not saved</span> : <span className="editor-bar__status">· saved</span>}
      </div>
      <div className="editor-bar__history">
        <button type="button" className="icon-btn icon-btn--raised" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useDesignStore.getState().undo()}>
          <UndoIcon />
        </button>
        <button type="button" className="icon-btn icon-btn--raised" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => useDesignStore.getState().redo()}>
          <RedoIcon />
        </button>
      </div>
      <div className="editor-bar__end">
        <SegmentedControl label="View mode" tone="accent" segments={VIEW_MODES} value="orbit" onChange={() => {}} />
        <SegmentedControl label="Quality" segments={QUALITY_SEGMENTS} value={quality} onChange={(q) => useSettingsStore.getState().update({ quality: q })} />
        <button type="button" className="btn btn--small" onClick={onDesigns}>
          My mansions
        </button>
        <button type="button" className="icon-btn icon-btn--raised" aria-label="Settings" onClick={onSettings}>
          <SettingsIcon />
        </button>
      </div>
    </header>
  )
}
