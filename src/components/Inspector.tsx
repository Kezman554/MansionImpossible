import { useDesignStore } from '../store/designStore'
import { plural } from './formatEdited'
import { RoomInspector } from './RoomInspector'

/** Right-hand panel: the selected room, or a summary of the mansion when nothing (or several things) is selected. */
export function Inspector() {
  const design = useDesignStore((s) => s.design)
  const selection = useDesignStore((s) => s.selection)
  const room = selection.length === 1 ? design.rooms.find((r) => r.id === selection[0]) : undefined

  if (room) {
    const floorName = design.floors.find((f) => f.index === room.floor)?.name ?? `Floor ${room.floor}`
    return (
      <aside aria-label="Inspector" className="inspector">
        <RoomInspector key={room.id} room={room} floorName={floorName} />
      </aside>
    )
  }

  const [plotX, plotZ] = design.terrain.size
  const rows: [string, string][] = [
    ['Floors', String(design.floors.length)],
    ['Rooms', String(design.rooms.length)],
    ['Pieces', String(design.pieces.length)],
    ['Furniture', String(design.furniture.length)],
    ['Plot', `${plotX} × ${plotZ} m`],
  ]

  return (
    <aside aria-label="Inspector" className="inspector">
      <section className="inspector__section">
        <div className="inspector__eyebrow">{selection.length ? `${plural(selection.length, 'object')} selected` : 'Nothing selected'}</div>
        <p className="inspector__hint">
          {design.rooms.length === 0 ? 'Draw a room with the Room tool (R): drag a rectangle on the grid.' : 'Click a room to edit it here.'}
        </p>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">This mansion</div>
        <dl className="inspector__facts">
          {rows.map(([term, value]) => (
            <div key={term} className="inspector__fact">
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  )
}
