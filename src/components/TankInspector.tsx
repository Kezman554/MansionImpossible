import { deleteSelection } from '../editor/deleteSelection'
import { resizeTank, setTankShape, TANK_SHAPES, tankSpan } from '../editor/tank'
import { useDesignStore } from '../store/designStore'
import type { FishTank } from '../types/design'
import { layoutFloorWalls } from '../scene/roomGeometry'
import { round2 } from './fieldKeys'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'
import { SegmentedControl } from './SegmentedControl'

/** Shape, size and position of the central fish tank; its height follows the floors. Each edit is one undo step. */
export function TankInspector({ tank }: { tank: FishTank }) {
  const design = useDesignStore((s) => s.design)
  const update = (next: FishTank) => {
    const store = useDesignStore.getState()
    if (next !== tank) store.applyDesign({ ...store.design, tank: next })
  }
  const span = tankSpan(design.floors)
  const floorName = (index: number) => design.floors.find((f) => f.index === index)?.name ?? `Floor ${index}`
  const spans = !span ? '—' : span.lowest === span.highest ? floorName(span.lowest) : `${floorName(span.lowest)} → ${floorName(span.highest)}`

  // Aquarium walls on each floor: rooms whose walls touch the tank.
  const aquariumFloors = design.floors.filter((f) => layoutFloorWalls(design.rooms.filter((r) => r.floor === f.index), tank).aquarium.length > 0).length
  const cylindrical = tank.shape === 'cylindrical'

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Core · all floors</div>
        <div className="inspector__title">Fish tank</div>
        <div className="field field--inline">
          <span className="field__label">Shape</span>
          <SegmentedControl label="Tank shape" segments={TANK_SHAPES} value={tank.shape} onChange={(shape) => update(setTankShape(tank, shape))} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Size, metres</div>
        <div className="field-grid">
          {cylindrical ? (
            <NumberField label="Diameter" value={tank.size[0]} onCommit={(v) => update(resizeTank(tank, 'x', v))} />
          ) : (
            <>
              <NumberField label="Width" value={tank.size[0]} onCommit={(v) => update(resizeTank(tank, 'x', v))} />
              <NumberField label="Depth" value={tank.size[1]} onCommit={(v) => update(resizeTank(tank, 'z', v))} />
            </>
          )}
          <NumberField label="Height" value={span ? span.top - span.bottom : 0} disabled title="Runs from the lowest floor to the top of the highest; follows the floors" onCommit={() => {}} />
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Centre, metres</div>
        <div className="field-grid">
          <NumberField label="X" value={tank.position[0]} onCommit={(v) => update({ ...tank, position: [round2(v), tank.position[1]] })} />
          <NumberField label="Z" value={tank.position[1]} onCommit={(v) => update({ ...tank, position: [tank.position[0], round2(v)] })} />
        </div>
      </section>
      <section className="inspector__section">
        <dl className="inspector__facts">
          <div className="inspector__fact">
            <dt>Spans</dt>
            <dd>{spans}</dd>
          </div>
          <div className="inspector__fact">
            <dt>Aquarium walls</dt>
            <dd>{aquariumFloors ? `On ${aquariumFloors} floor${aquariumFloors === 1 ? '' : 's'}` : 'None — build rooms against it'}</dd>
          </div>
        </dl>
      </section>
      <div className="inspector__actions">
        <button type="button" className="btn btn--danger-outline" onClick={deleteSelection}>
          <BinIcon size={14} />
          Delete tank
        </button>
      </div>
    </>
  )
}
