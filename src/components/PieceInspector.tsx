import { MATERIALS } from '../editor/catalog/materials'
import { deleteSelection } from '../editor/deleteSelection'
import { duplicateSelection, setPieceMaterial } from '../editor/freeform/actions'
import { pieceLabel } from '../editor/freeform/catalog'
import { MIN_PIECE_SIZE } from '../editor/freeform/pieces'
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

/** Several things selected: what they are, and what can be done to them all at once. */
export function SelectionInspector({ ids }: { ids: string[] }) {
  const design = useDesignStore((s) => s.design)
  const pieces = design.pieces.filter((p) => ids.includes(p.id))
  const rooms = design.rooms.filter((r) => ids.includes(r.id)).length
  const parts = [rooms && `${rooms} room${rooms === 1 ? '' : 's'}`, pieces.length && `${pieces.length} piece${pieces.length === 1 ? '' : 's'}`].filter(Boolean)

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
