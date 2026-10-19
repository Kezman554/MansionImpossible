import { OPENING_STYLES } from '../editor/openings'
import { useEditorStore } from '../store/editorStore'
import type { OpeningStyle } from '../types/design'

// Simple elevation drawings of each style, stroked in currentColor.
const STYLE_ICONS: Record<OpeningStyle, string> = {
  'single-door': 'M7 21V4h10v17M3 21h18M14 13h.01',
  'double-door': 'M4 21V4h16v17M2 21h20M12 4v17M10 13h.01M14 13h.01',
  window: 'M5 6h14v10H5zM12 6v10M5 11h14M3 19h18',
  'glass-wall': 'M3 3h18v18H3zM9 3v18M15 3v18',
}

const ORDER: OpeningStyle[] = ['single-door', 'double-door', 'window', 'glass-wall']

/** Catalogue tray (bottom of the viewport, DESIGN.md) for the door and window tools: pick the style to place. */
export function OpeningTray() {
  const tool = useEditorStore((s) => s.tool)
  const style = useEditorStore((s) => s.openingStyle)
  if (tool !== 'door' && tool !== 'window') return null

  return (
    <section aria-label="Doors and windows" className="tray">
      <div className="tray__head">
        <span className="tray__title">Doors and windows</span>
        <span className="tray__hint">Click a wall to place · drag to look around</span>
      </div>
      <div className="tray__tiles" role="group" aria-label="Opening style">
        {ORDER.map((value) => (
          <button key={value} type="button" className="tray__tile" aria-pressed={value === style} onClick={() => useEditorStore.getState().setOpeningStyle(value)}>
            <svg className="icon" width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
              <path d={STYLE_ICONS[value]} />
            </svg>
            {OPENING_STYLES[value].label}
          </button>
        ))}
      </div>
    </section>
  )
}
