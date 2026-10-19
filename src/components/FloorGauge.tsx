import { addFloorAndSwitch, changeFloorHeight, removeFloorWithUndo, renameFloorTo } from '../editor/floorActions'
import { sortFloors } from '../editor/floors'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { onFieldKeys } from './fieldKeys'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'
import { SegmentedControl } from './SegmentedControl'

/**
 * The floor switcher, drawn as a depth gauge (DESIGN.md: floor gauge, top-left of the viewport).
 * The tube shows the stack with the active floor in coral; rows switch floors, add floors above
 * and basements below, and the active row renames, resizes and removes its floor.
 */
export function FloorGauge() {
  const floors = useDesignStore((s) => s.design.floors)
  const rooms = useDesignStore((s) => s.design.rooms)
  const active = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)
  const stack = sortFloors(floors).reverse() // highest first, like a building

  const status = (index: number) => (index === active ? 'editing' : index > active ? 'hidden' : belowFloors === 'ghost' ? 'ghosted' : 'hidden')
  const roomCount = (index: number) => rooms.filter((r) => r.floor === index).length

  return (
    <section aria-label="Floors" className="gauge">
      <div className="gauge__tube" aria-hidden="true">
        {stack.map((f) => (
          <div key={f.id} className={`gauge__segment${f.index === active ? ' gauge__segment--active' : ''}${f.index === 0 ? ' gauge__segment--ground' : ''}`} style={{ flexGrow: f.height }} />
        ))}
      </div>
      <div className="gauge__body">
        <div className="gauge__heading">Floors</div>
        <button type="button" className="gauge__add" onClick={() => addFloorAndSwitch('above')}>
          + Floor above
        </button>
        <ol className="gauge__list">
          {stack.map((f) =>
            f.index === active ? (
              <li key={f.id} className="gauge__row gauge__row--active" aria-current="true">
                <input
                  key={`name-${f.name}`}
                  className="gauge__name-input"
                  aria-label="Floor name"
                  defaultValue={f.name}
                  onKeyDown={(e) => onFieldKeys(e, f.name)}
                  onBlur={(e) => {
                    if (e.currentTarget.value.trim()) renameFloorTo(f.index, e.currentTarget.value)
                    else e.currentTarget.value = f.name
                  }}
                />
                <span className="gauge__status gauge__status--active">editing</span>
                <div className="gauge__details">
                  <NumberField label="Height, m" value={f.height} onCommit={(h) => changeFloorHeight(f.index, h)} />
                  <button
                    type="button"
                    className="gauge__remove"
                    disabled={floors.length <= 1}
                    title={floors.length <= 1 ? 'A mansion needs at least one floor' : `Remove ${f.name} and everything on it`}
                    onClick={() => removeFloorWithUndo(f.index)}
                  >
                    <BinIcon size={13} />
                    Remove
                  </button>
                </div>
              </li>
            ) : (
              <li key={f.id}>
                <button type="button" className="gauge__row" onClick={() => useEditorStore.getState().setActiveFloor(f.index)}>
                  <span className="gauge__name">{f.name}</span>
                  <span className="gauge__status">
                    {roomCount(f.index) ? `${roomCount(f.index)} · ` : ''}
                    {status(f.index)}
                  </span>
                </button>
              </li>
            ),
          )}
        </ol>
        <button type="button" className="gauge__add" onClick={() => addFloorAndSwitch('below')}>
          + Basement
        </button>
        <div className="gauge__below">
          <span>Below</span>
          <SegmentedControl
            label="Floors below"
            segments={[
              { value: 'ghost', label: 'Ghost' },
              { value: 'hide', label: 'Hide' },
            ]}
            value={belowFloors}
            onChange={(mode) => useEditorStore.getState().setBelowFloors(mode)}
          />
        </div>
      </div>
    </section>
  )
}
