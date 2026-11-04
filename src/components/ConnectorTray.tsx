import { setSnap } from '../editor/freeform/actions'
import { CONNECTOR_TYPES, CONNECTORS } from '../editor/connectors/catalog'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'

/** Catalogue tray for the connector tool: stairs, the elevator, slides and the pole, plus grid snap. */
export function ConnectorTray() {
  const tool = useEditorStore((s) => s.tool)
  const connectorType = useEditorStore((s) => s.connectorType)
  const snapOn = useDesignStore((s) => s.design.settings.snapToGrid)
  const gridSize = useDesignStore((s) => s.design.settings.gridSize)
  if (tool !== 'connector') return null

  return (
    <section aria-label="Connectors" className="tray">
      <div className="tray__head">
        <span className="tray__title">Stairs, lifts and slides</span>
        <span className="tray__hint">Click to place · joins this floor to the next · pick floors in the inspector</span>
        <label className="tray__snap">
          <input type="checkbox" checked={snapOn} onChange={(e) => setSnap(e.target.checked)} />
          Snap {gridSize} m
        </label>
      </div>
      <div className="tray__tiles tray__tiles--pieces" role="group" aria-label="Connector">
        {CONNECTOR_TYPES.map((type) => (
          <button key={type} type="button" className="tray__tile" aria-pressed={type === connectorType} onClick={() => useEditorStore.getState().setConnectorType(type)}>
            <svg className="icon" width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
              <path d={CONNECTORS[type].icon} />
            </svg>
            {CONNECTORS[type].label}
          </button>
        ))}
      </div>
    </section>
  )
}
