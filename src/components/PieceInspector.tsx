import { MATERIALS } from '../editor/catalog/materials'
import { deleteSelection } from '../editor/deleteSelection'
import { duplicateSelection, setPieceMaterial } from '../editor/freeform/actions'
import { pieceLabel } from '../editor/freeform/catalog'
import { MIN_PIECE_SIZE } from '../editor/freeform/pieces'
import { CONNECTORS, type ConnectorType } from '../editor/connectors/catalog'
import { connectorFloors, connectorSize, isConnector, resizeConnector, setConnectorFloors } from '../editor/connectors/connectors'
import { sortFloors } from '../editor/floors'
import { useDesignStore } from '../store/designStore'
import { useEditorStore, type GizmoMode } from '../store/editorStore'
import type { Piece, Vec3 } from '../types/design'
import { round2 } from './fieldKeys'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'
import { SegmentedControl } from './SegmentedControl'

const DEG = 180 / Math.PI
const GIZMO_MODES: { value: GizmoMode; label: string }[] = [
  { value: 'translate', label: 'Move' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'scale', label: 'Scale' },
]

function MaterialSelect({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  return (
    <label className="field field--inline">
      <span className="field__label">Material</span>
      <select className="field__input field__select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {Object.values(MATERIALS).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Position, height, rotation, size and material of one freeform piece; each edit is one undo step. */
export function PieceInspector({ piece, floorName }: { piece: Piece; floorName: string }) {
  if (isConnector(piece)) return <ConnectorInspector piece={piece} />
  return <FreeformInspector piece={piece} floorName={floorName} />
}

function FreeformInspector({ piece, floorName }: { piece: Piece; floorName: string }) {
  const mode = useEditorStore((s) => s.gizmoMode)
  const update = (patch: Partial<Piece>) => useDesignStore.getState().updateObject(piece.id, patch)
  const setAt = (key: 'position' | 'rotation' | 'size', i: number, v: number) => {
    const next = [...piece[key]] as Vec3
    next[i] = key === 'rotation' ? v / DEG : key === 'size' ? Math.max(MIN_PIECE_SIZE, round2(v)) : key === 'position' && i === 1 ? Math.max(0, round2(v)) : round2(v)
    update({ [key]: next })
  }

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Piece · {floorName}</div>
        <div className="inspector__title">{pieceLabel(piece.type)}</div>
        <MaterialSelect value={piece.material} onChange={(id) => setPieceMaterial([piece.id], id)} />
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Position, metres</div>
        <div className="field-grid field-grid--3">
          <NumberField label="X" value={piece.position[0]} onCommit={(v) => setAt('position', 0, v)} />
          <NumberField label="Height" value={piece.position[1]} title="Height of the piece's base above the floor" onCommit={(v) => setAt('position', 1, v)} />
          <NumberField label="Z" value={piece.position[2]} onCommit={(v) => setAt('position', 2, v)} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Rotation, degrees</div>
        <div className="field-grid field-grid--3">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <NumberField key={axis} label={axis} value={round2(piece.rotation[i] * DEG)} onCommit={(v) => setAt('rotation', i, v)} />
          ))}
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Size, metres</div>
        <div className="field-grid field-grid--3">
          {(['Width', 'Height', 'Depth'] as const).map((label, i) => (
            <NumberField key={label} label={label} value={piece.size[i]} onCommit={(v) => setAt('size', i, v)} />
          ))}
        </div>
      </section>
      <section className="inspector__section">
        <div className="field field--inline">
          <span className="field__label">Gizmo</span>
          <SegmentedControl label="Gizmo" segments={GIZMO_MODES} value={mode} onChange={(m) => useEditorStore.getState().setGizmoMode(m)} />
        </div>
      </section>
      <div className="inspector__actions">
        <button type="button" className="btn btn--small btn--on-raised" onClick={duplicateSelection} title="Duplicate (Ctrl+D)">
          Duplicate
        </button>
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete
        </button>
      </div>
    </>
  )
}

const CONNECTOR_GIZMO_MODES = GIZMO_MODES.filter((m) => m.value !== 'scale')

/**
 * A vertical connector: the floors it joins (its height and run are fitted to them), its
 * footprint, position and turn. Each edit is one undo step.
 */
function ConnectorInspector({ piece }: { piece: Piece }) {
  const mode = useEditorStore((s) => s.gizmoMode)
  const floors = useDesignStore((s) => s.design.floors)
  const update = (patch: Partial<Piece>) => useDesignStore.getState().updateObject(piece.id, patch)
  const spec = CONNECTORS[piece.type as ConnectorType]
  const { from, to } = connectorFloors(piece)
  const [width, height, depth] = connectorSize(piece, floors)
  const ordered = sortFloors(floors)
  const name = (index: number) => floors.find((f) => f.index === index)?.name ?? `Floor ${index}`

  const floorSelect = (label: string, value: number, onChange: (index: number) => void) => (
    <label className="field field--inline">
      <span className="field__label">{label}</span>
      <select className="field__input field__select" aria-label={`${label} floor`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[...ordered].reverse().map((f) => (
          <option key={f.id} value={f.index}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Connector · {from === to ? name(from) : `${name(from)} → ${name(to)}`}</div>
        <div className="inspector__title">{spec.label}</div>
        {floorSelect('From', from, (index) => update(setConnectorFloors(piece, index, index === to ? from : to, floors)))}
        {floorSelect('To', to, (index) => update(setConnectorFloors(piece, index === from ? to : from, index, floors)))}
        <MaterialSelect value={piece.material} onChange={(id) => setPieceMaterial([piece.id], id)} />
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Size, metres</div>
        <div className="field-grid">
          <NumberField label={spec.round ? 'Diameter' : 'Width'} value={width} onCommit={(v) => update(resizeConnector(piece, 'x', v, floors))} />
          {spec.setDepth && <NumberField label="Depth" value={depth} onCommit={(v) => update(resizeConnector(piece, 'z', v, floors))} />}
          {spec.fittedRun && <NumberField label="Run" value={depth} disabled title="Fitted to the height" onCommit={() => {}} />}
          <NumberField label="Height" value={height} disabled title="Fitted to the floors it joins" onCommit={() => {}} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Position, metres · turn, degrees</div>
        <div className="field-grid field-grid--3">
          <NumberField label="X" value={piece.position[0]} onCommit={(v) => update({ position: [round2(v), 0, piece.position[2]] })} />
          <NumberField label="Z" value={piece.position[2]} onCommit={(v) => update({ position: [piece.position[0], 0, round2(v)] })} />
          <NumberField label="Turn" value={round2(piece.rotation[1] * DEG)} onCommit={(v) => update({ rotation: [0, v / DEG, 0] })} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="field field--inline">
          <span className="field__label">Gizmo</span>
          <SegmentedControl label="Gizmo" segments={CONNECTOR_GIZMO_MODES} value={mode === 'scale' ? 'translate' : mode} onChange={(m) => useEditorStore.getState().setGizmoMode(m)} />
        </div>
      </section>
      <div className="inspector__actions">
        <button type="button" className="btn btn--small btn--on-raised" onClick={duplicateSelection} title="Duplicate (Ctrl+D)">
          Duplicate
        </button>
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete
        </button>
      </div>
    </>
  )
}

/** Several things selected: what they are, and what can be done to them all at once. */
export function SelectionInspector({ ids }: { ids: string[] }) {
  const design = useDesignStore((s) => s.design)
  const pieces = design.pieces.filter((p) => ids.includes(p.id))
  const rooms = design.rooms.filter((r) => ids.includes(r.id)).length
  const tank = !!design.tank && ids.includes(design.tank.id)
  const parts = [rooms && `${rooms} room${rooms === 1 ? '' : 's'}`, pieces.length && `${pieces.length} piece${pieces.length === 1 ? '' : 's'}`, tank && 'fish tank'].filter(Boolean)

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">{ids.length} selected</div>
        <div className="inspector__title">{parts.join(' · ')}</div>
        <p className="inspector__note">Shift-click to add or remove. The gizmo moves them together.</p>
        {pieces.length > 0 && (
          <MaterialSelect value={pieces.every((p) => p.material === pieces[0].material) ? pieces[0].material : null} onChange={(id) => setPieceMaterial(pieces.map((p) => p.id), id)} />
        )}
      </section>
      <div className="inspector__actions">
        {pieces.length > 0 && (
          <button type="button" className="btn btn--small btn--on-raised" onClick={duplicateSelection} title="Duplicate (Ctrl+D)">
            Duplicate
          </button>
        )}
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete {ids.length}
        </button>
      </div>
    </>
  )
}
