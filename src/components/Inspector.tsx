import { useDesignStore } from '../store/designStore'
import { plural } from './formatEdited'

/** Right-hand panel. Until selection tools exist it summarises the open mansion. */
export function Inspector() {
  const design = useDesignStore((s) => s.design)
  const selected = useDesignStore((s) => s.selection.length)
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
        <div className="inspector__eyebrow">{selected ? plural(selected, 'object') + ' selected' : 'Nothing selected'}</div>
        <p className="inspector__hint">Select a room, piece or piece of furniture to edit it here.</p>
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
