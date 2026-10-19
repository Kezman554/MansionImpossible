import { deleteSelection } from '../editor/deleteSelection'
import { reattachOpenings, refitOpenings } from '../editor/openings'
import { placementFromRect, ROOM_LIMITS, ROOM_TYPES, roomRect } from '../editor/roomTool'
import { useDesignStore, type ObjectPatch } from '../store/designStore'
import type { Room } from '../types/design'
import { onFieldKeys, round2 } from './fieldKeys'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'

function openingSummary(room: Room): string {
  const doors = room.openings.filter((o) => o.type === 'door').length
  const windows = room.openings.length - doors
  if (!room.openings.length) return 'None — use the Door or Window tool'
  return [doors && `${doors} door${doors === 1 ? '' : 's'}`, windows && `${windows} window${windows === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
}

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v))

/** Name, type label, size and wall settings for one selected room. */
export function RoomInspector({ room, floorName }: { room: Room; floorName: string }) {
  const update = (patch: ObjectPatch) => useDesignStore.getState().updateObject(room.id, patch)
  const rect = roomRect(room)
  const [width, height, length] = room.size
  const types: readonly string[] = ROOM_TYPES.includes(room.type as (typeof ROOM_TYPES)[number]) ? ROOM_TYPES : [room.type, ...ROOM_TYPES]

  // Wall height and thickness change how much room openings have; re-fit them in the same undo step.
  const refit = (patch: Pick<Room, 'size'> | Pick<Room, 'wallThickness'>) => update({ ...patch, openings: refitOpenings({ ...room, ...patch }) })

  // Width and length grow or shrink from the north-west corner, so edges on the grid stay on it.
  const resize = (axis: 'x' | 'z', value: number) => {
    const side = round2(clamp(value, ROOM_LIMITS.side))
    const next = axis === 'x' ? { ...rect, x1: rect.x0 + side } : { ...rect, z1: rect.z0 + side }
    update({ ...placementFromRect(next, height, room.position[1]), openings: reattachOpenings(room, rect, next) })
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
          <NumberField label="Wall height" value={height} onCommit={(v) => refit({ size: [width, round2(clamp(v, ROOM_LIMITS.wallHeight)), length] })} />
          <NumberField label="Wall thickness" value={room.wallThickness} onCommit={(v) => refit({ wallThickness: round2(clamp(v, ROOM_LIMITS.wallThickness)) })} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__fact">
          <span>Openings</span>
          <span className="inspector__muted">{openingSummary(room)}</span>
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
