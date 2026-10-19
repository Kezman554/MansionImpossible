import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { OpeningInspector } from './OpeningInspector'
import { PieceInspector, SelectionInspector } from './PieceInspector'
import { plural } from './formatEdited'
import { RoomInspector } from './RoomInspector'

/** Right-hand panel: the selected room, or a summary of the mansion when nothing (or several things) is selected. */
export function Inspector() {
  const design = useDesignStore((s) => s.design)
  const selection = useDesignStore((s) => s.selection)
  const openingRef = useEditorStore((s) => s.selectedOpening)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const room = selection.length === 1 ? design.rooms.find((r) => r.id === selection[0]) : undefined

  // An opening is selected inside its room; after an undo it may no longer exist.
  const openingRoom = openingRef ? design.rooms.find((r) => r.id === openingRef.roomId) : undefined
  const opening = openingRoom?.openings.find((o) => o.id === openingRef?.openingId)
  if (openingRoom && opening) {
    return (
      <aside aria-label="Inspector" className="inspector">
        <OpeningInspector key={opening.id} room={openingRoom} opening={opening} />
      </aside>
    )
  }

  const piece = selection.length === 1 ? design.pieces.find((p) => p.id === selection[0]) : undefined
  if (piece) {
    const floorName = design.floors.find((f) => f.index === piece.floor)?.name ?? `Floor ${piece.floor}`
    return (
      <aside aria-label="Inspector" className="inspector">
        <PieceInspector key={piece.id} piece={piece} floorName={floorName} />
      </aside>
    )
  }
  if (selection.length > 1) {
    return (
      <aside aria-label="Inspector" className="inspector">
        <SelectionInspector ids={selection} />
      </aside>
    )
  }

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
          {design.rooms.some((r) => r.floor === activeFloor) ? 'Click a room to edit it here.' : 'Draw a room on this floor with the Room tool (R): drag a rectangle on the grid.'}
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
