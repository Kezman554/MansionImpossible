import type { RefObject } from 'react'
import { roomRect, type Rect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { plural } from './formatEdited'

interface StatusBarProps {
  /** Updated directly by the viewport as the pointer moves, without re-rendering. */
  cursorRef: RefObject<HTMLSpanElement | null>
}

const formatSize = (r: Rect) => `${+(r.x1 - r.x0).toFixed(2)} × ${+(r.z1 - r.z0).toFixed(2)} m`

const formatHour = (hours: number) => `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`

export function StatusBar({ cursorRef }: StatusBarProps) {
  const settings = useDesignStore((s) => s.design.settings)
  const floor = useDesignStore((s) => s.design.floors.find((f) => f.index === 0))
  const groundRooms = useDesignStore((s) => s.design.rooms.filter((r) => r.floor === 0).length)
  const draft = useEditorStore((s) => s.draft)
  const dragging = useEditorStore((s) => s.dragging)
  const dragged = useDesignStore((s) => (s.selection.length === 1 ? s.design.rooms.find((r) => r.id === s.selection[0]) : undefined))
  const live = draft ?? (dragging && dragged ? roomRect(dragged) : null)

  return (
    <footer className="status-bar">
      <span>{settings.snapToGrid ? `Snap ${settings.gridSize} m` : 'Snap off'}</span>
      <span>
        Cursor <span ref={cursorRef}>–</span>
      </span>
      <span>
        {floor?.name ?? 'Ground floor'} · {plural(groundRooms, 'room')}
      </span>
      {live && <span className="status-bar__live">Room {formatSize(live)}</span>}
      <label className="status-bar__time" title="Day/night cycle — coming soon">
        Time of day {formatHour(settings.timeOfDay)}
        <input type="range" min={0} max={24} step={0.5} value={settings.timeOfDay} disabled readOnly />
      </label>
    </footer>
  )
}
