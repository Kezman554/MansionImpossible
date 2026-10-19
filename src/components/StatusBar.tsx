import type { RefObject } from 'react'
import { useDesignStore } from '../store/designStore'
import { plural } from './formatEdited'

interface StatusBarProps {
  /** Updated directly by the viewport as the pointer moves, without re-rendering. */
  cursorRef: RefObject<HTMLSpanElement | null>
}

const formatHour = (hours: number) => `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`

export function StatusBar({ cursorRef }: StatusBarProps) {
  const settings = useDesignStore((s) => s.design.settings)
  const floor = useDesignStore((s) => s.design.floors.find((f) => f.index === 0))
  const groundRooms = useDesignStore((s) => s.design.rooms.filter((r) => r.floor === 0).length)

  return (
    <footer className="status-bar">
      <span>{settings.snapToGrid ? `Snap ${settings.gridSize} m` : 'Snap off'}</span>
      <span>
        Cursor <span ref={cursorRef}>–</span>
      </span>
      <span>
        {floor?.name ?? 'Ground floor'} · {plural(groundRooms, 'room')}
      </span>
      <label className="status-bar__time" title="Day/night cycle — coming soon">
        Time of day {formatHour(settings.timeOfDay)}
        <input type="range" min={0} max={24} step={0.5} value={settings.timeOfDay} disabled readOnly />
      </label>
    </footer>
  )
}
