import { setSnap } from '../editor/freeform/actions'
import { PIECE_PALETTE, PIECES } from '../editor/freeform/catalog'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'

/** Catalogue tray (bottom of the viewport, DESIGN.md) for the freeform tool: the piece palette and grid snap. */
export function PieceTray() {
  const tool = useEditorStore((s) => s.tool)
  const pieceType = useEditorStore((s) => s.pieceType)
  const snapOn = useDesignStore((s) => s.design.settings.snapToGrid)
  const gridSize = useDesignStore((s) => s.design.settings.gridSize)
  if (tool !== 'freeform') return null

  return (
    <section aria-label="Freeform pieces" className="tray">
      <div className="tray__head">
        <span className="tray__title">Freeform pieces</span>
        <span className="tray__hint">Click to place · on a piece to stack · M / T / S move, rotate, scale</span>
        <label className="tray__snap">
          <input type="checkbox" checked={snapOn} onChange={(e) => setSnap(e.target.checked)} />
          Snap {gridSize} m
        </label>
      </div>
      <div className="tray__tiles tray__tiles--pieces" role="group" aria-label="Piece">
        {PIECE_PALETTE.map((type) => (
          <button key={type} type="button" className="tray__tile" aria-pressed={type === pieceType} onClick={() => useEditorStore.getState().setPieceType(type)}>
            <svg className="icon" width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
              <path d={PIECES[type].icon} />
            </svg>
            {PIECES[type].label}
          </button>
        ))}
      </div>
    </section>
  )
}
