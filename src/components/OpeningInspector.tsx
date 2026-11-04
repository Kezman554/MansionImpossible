import { deleteSelection } from '../editor/deleteSelection'
import { fitOpening, OPENING_STYLES, restyleOpening, wallOf } from '../editor/openings'
import { SegmentedControl } from './SegmentedControl'

const HINGES: { value: 'left' | 'right'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]
import { roomRect } from '../editor/roomTool'
import { useDesignStore } from '../store/designStore'
import type { Opening, OpeningStyle, Room } from '../types/design'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'

const STYLES = Object.entries(OPENING_STYLES) as [OpeningStyle, (typeof OPENING_STYLES)[OpeningStyle]][]

/** Style, size and position of one door or window. Every change is one undo step and is fitted to its wall. */
export function OpeningInspector({ room, opening }: { room: Room; opening: Opening }) {
  const wall = wallOf(roomRect(room), opening.wall)
  const isDoor = opening.type === 'door'
  const label = OPENING_STYLES[opening.style].label

  const save = (next: Opening) => {
    const fitted = fitOpening(next, room, wall.length)
    useDesignStore.getState().updateObject(room.id, { openings: room.openings.map((o) => (o.id === opening.id ? fitted : o)) })
  }

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">
          {isDoor ? 'Door' : 'Window'} · {room.name} · {opening.wall} wall
        </div>
        <div className="inspector__title">{label}</div>
        <label className="field field--inline">
          <span className="field__label">Style</span>
          <select
            className="field__input field__select"
            value={opening.style}
            onChange={(e) => {
              const restyled = restyleOpening(opening, e.target.value as OpeningStyle, room)
              useDesignStore.getState().updateObject(room.id, { openings: room.openings.map((o) => (o.id === opening.id ? restyled : o)) })
            }}
          >
            {STYLES.map(([value, spec]) => (
              <option key={value} value={value}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Size, metres</div>
        <div className="field-grid">
          <NumberField label="Width" value={opening.width} onCommit={(width) => save({ ...opening, width })} />
          <NumberField label="Height" value={opening.height} onCommit={(height) => save({ ...opening, height })} />
          <NumberField
            label="Sill height"
            value={opening.sill}
            disabled={isDoor}
            title={isDoor ? 'Doors sit on the floor' : undefined}
            onCommit={(sill) => save({ ...opening, sill })}
          />
          <NumberField label="Along wall" value={opening.offset} title="Distance from the wall's west or north end to the middle of the opening" onCommit={(offset) => save({ ...opening, offset })} />
        </div>
        <p className="inspector__note">Drag it in the viewport to slide it along the wall.</p>
      </section>
      {opening.style === 'bookcase' && (
        <section className="inspector__section">
          <div className="inspector__eyebrow">Secret door</div>
          <div className="field field--inline">
            <span className="field__label">Hinge</span>
            <SegmentedControl label="Hinge side" segments={HINGES} value={opening.hinge ?? 'left'} onChange={(hinge) => save({ ...opening, hinge })} />
          </div>
          <label className="field field--inline inspector__check">
            <input type="checkbox" checked={opening.open ?? false} onChange={(e) => save({ ...opening, open: e.target.checked })} />
            <span className="field__label">Open</span>
          </label>
          <p className="inspector__note">Saved with the design; drawn closed until the swing is animated.</p>
        </section>
      )}
      <div className="inspector__actions">
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete {isDoor ? 'door' : 'window'}
        </button>
      </div>
    </>
  )
}
