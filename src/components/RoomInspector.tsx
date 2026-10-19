import type { KeyboardEvent } from 'react'
import { deleteSelection } from '../editor/deleteSelection'
import { placementFromRect, ROOM_LIMITS, ROOM_TYPES, roomRect } from '../editor/roomTool'
import { useDesignStore, type ObjectPatch } from '../store/designStore'
import type { Room } from '../types/design'
import { BinIcon } from './icons'

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v))

/**
 * Commits on Enter or blur (one undo step per edit), Escape puts the value back.
 * Uncontrolled and keyed on the value, so undo or a drag in the viewport refreshes it.
 */
function onFieldKeys(e: KeyboardEvent<HTMLInputElement>, original: string) {
  if (e.key === 'Enter') e.currentTarget.blur()
  if (e.key === 'Escape') {
    e.currentTarget.value = original
    e.currentTarget.blur()
  }
}

interface NumberFieldProps {
  label: string
  value: number
  onCommit: (value: number) => void
}

function NumberField({ label, value, onCommit }: NumberFieldProps) {
  const text = String(round2(value))
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        key={text}
        className="field__input"
        inputMode="decimal"
        defaultValue={text}
        onKeyDown={(e) => onFieldKeys(e, text)}
        onBlur={(e) => {
          const parsed = Number(e.currentTarget.value.replace(',', '.'))
          if (!Number.isFinite(parsed) || e.currentTarget.value.trim() === '') e.currentTarget.value = text
          else if (round2(parsed) !== round2(value)) onCommit(parsed)
        }}
      />
    </label>
  )
}

/** Name, type label, size and wall settings for one selected room. */
export function RoomInspector({ room, floorName }: { room: Room; floorName: string }) {
  const update = (patch: ObjectPatch) => useDesignStore.getState().updateObject(room.id, patch)
  const rect = roomRect(room)
  const [width, height, length] = room.size
  const types: readonly string[] = ROOM_TYPES.includes(room.type as (typeof ROOM_TYPES)[number]) ? ROOM_TYPES : [room.type, ...ROOM_TYPES]

  // Width and length grow or shrink from the north-west corner, so edges on the grid stay on it.
  const resize = (axis: 'x' | 'z', value: number) => {
    const side = round2(clamp(value, ROOM_LIMITS.side))
    const next = axis === 'x' ? { ...rect, x1: rect.x0 + side } : { ...rect, z1: rect.z0 + side }
    update(placementFromRect(next, height, room.position[1]))
  }

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Room · {floorName}</div>
        <input
          key={`name-${room.name}`}
          className="field__input field__input--title"
          aria-label="Room name"
          defaultValue={room.name}
          onKeyDown={(e) => onFieldKeys(e, room.name)}
          onBlur={(e) => {
            const name = e.currentTarget.value.trim()
            if (!name) e.currentTarget.value = room.name
            else if (name !== room.name) update({ name })
          }}
        />
        <label className="field field--inline">
          <span className="field__label">Type</span>
          <select className="field__input field__select" value={room.type} onChange={(e) => update({ type: e.target.value })}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Size, metres</div>
        <div className="field-grid">
          <NumberField label="Width" value={width} onCommit={(v) => resize('x', v)} />
          <NumberField label="Length" value={length} onCommit={(v) => resize('z', v)} />
          <NumberField label="Wall height" value={height} onCommit={(v) => update({ size: [width, round2(clamp(v, ROOM_LIMITS.wallHeight)), length] })} />
          <NumberField label="Wall thickness" value={room.wallThickness} onCommit={(v) => update({ wallThickness: round2(clamp(v, ROOM_LIMITS.wallThickness)) })} />
        </div>
      </section>
      <div className="inspector__actions">
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete room
        </button>
      </div>
    </>
  )
}
