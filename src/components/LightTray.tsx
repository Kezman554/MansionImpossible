import { LIGHT_TYPES, LIGHTS } from '../editor/catalog/lights'
import { useEditorStore } from '../store/editorStore'
import { LightColours } from './LightInspector'

/** Catalogue tray for the light tool: the four light types and the colour new lights take. */
export function LightTray() {
  const tool = useEditorStore((s) => s.tool)
  const type = useEditorStore((s) => s.lightType)
  const colour = useEditorStore((s) => s.lightColour)
  if (tool !== 'light') return null

  return (
    <section aria-label="Lights" className="tray">
      <div className="tray__head">
        <span className="tray__title">Lights</span>
        <span className="tray__hint">Click to place on this floor · lamps stand on the floor, the rest hang under the ceiling</span>
        <LightColours value={colour} onPick={(c) => useEditorStore.getState().setLightColour(c)} />
      </div>
      <div className="tray__tiles tray__tiles--pieces" role="group" aria-label="Light">
        {LIGHT_TYPES.map((t) => (
          <button key={t} type="button" className="tray__tile" aria-pressed={t === type} onClick={() => useEditorStore.getState().setLightType(t)}>
            <svg className="icon" width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
              <path d={LIGHTS[t].icon} />
            </svg>
            {LIGHTS[t].label}
          </button>
        ))}
      </div>
    </section>
  )
}
