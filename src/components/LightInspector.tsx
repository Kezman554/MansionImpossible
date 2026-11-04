import { useEffect, useRef } from 'react'
import { LIGHT_COLOURS, LIGHT_LIMITS, LIGHTS } from '../editor/catalog/lights'
import { deleteSelection } from '../editor/deleteSelection'
import { duplicateSelection } from '../editor/freeform/actions'
import { setShadowLight } from '../editor/lights'
import { useDesignStore } from '../store/designStore'
import { useSettingsStore } from '../store/settingsStore'
import type { Light } from '../types/design'
import { round2 } from './fieldKeys'
import { BinIcon } from './icons'
import { NumberField } from './NumberField'

const DEG = 180 / Math.PI
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v))

/**
 * A colour picker that commits once, when the picker closes (the native change event), so
 * trying colours is one undo step, not one per pointer move.
 */
export function ColourInput({ value, label, onCommit }: { value: string; label: string; onCommit: (colour: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const el = input.current
    if (!el) return
    const onChange = () => commit.current(el.value)
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [])
  return <input ref={input} key={value} type="color" className="colour-input" aria-label={label} defaultValue={value} />
}

/** Colour presets and the picker: scene colours from the lights catalogue, shown inline (never chrome tokens). */
export function LightColours({ value, onPick }: { value: string; onPick: (colour: string) => void }) {
  return (
    <div className="light-colours" role="group" aria-label="Light colour">
      {LIGHT_COLOURS.map((c) => (
        <button key={c.color} type="button" className="light-colours__chip" title={c.label} aria-label={c.label} aria-pressed={value.toLowerCase() === c.color.toLowerCase()} style={{ background: c.color }} onClick={() => onPick(c.color)} />
      ))}
      <ColourInput value={value} label="Custom light colour" onCommit={onPick} />
    </div>
  )
}

/** Colour, brightness, placement and shadows of one light; each edit is one undo step. */
export function LightInspector({ light, floorName }: { light: Light; floorName: string }) {
  const quality = useSettingsStore((s) => s.quality)
  const update = (patch: Partial<Light>) => useDesignStore.getState().updateObject(light.id, patch)
  const setAt = (key: 'position' | 'rotation', i: number, v: number) => {
    const next = [...light[key]] as Light['position']
    next[i] = key === 'rotation' ? v / DEG : round2(v)
    update({ [key]: next })
  }
  const spec = LIGHTS[light.type]

  return (
    <>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Light · {floorName}</div>
        <div className="inspector__title">{spec.label}</div>
        <div className="field field--inline">
          <span className="field__label">Colour</span>
          <LightColours value={light.color} onPick={(color) => color.toLowerCase() !== light.color.toLowerCase() && update({ color })} />
        </div>
        <div className="field-grid">
          <NumberField label="Brightness, cd" value={light.intensity} onCommit={(v) => update({ intensity: round2(clamp(v, LIGHT_LIMITS.intensity)) })} />
          {light.type === 'strip' && <NumberField label="Length" value={light.length} onCommit={(v) => update({ length: round2(clamp(v, LIGHT_LIMITS.length)) })} />}
          {light.type === 'spot' && <NumberField label="Cone, °" value={round2(light.angle * DEG)} onCommit={(v) => update({ angle: clamp(v / DEG, LIGHT_LIMITS.angle) })} />}
        </div>
      </section>
      <section className="inspector__section">
        <div className="inspector__eyebrow">Position, metres · turn, degrees</div>
        <div className="field-grid field-grid--3">
          <NumberField label="X" value={light.position[0]} onCommit={(v) => setAt('position', 0, v)} />
          <NumberField label="Height" value={light.position[1]} title="Above the floor" onCommit={(v) => setAt('position', 1, Math.max(0, v))} />
          <NumberField label="Z" value={light.position[2]} onCommit={(v) => setAt('position', 2, v)} />
          <NumberField label="Turn" value={round2(light.rotation[1] * DEG)} onCommit={(v) => setAt('rotation', 1, v)} />
          {light.type === 'spot' && <NumberField label="Tilt" value={round2(light.rotation[0] * DEG)} onCommit={(v) => setAt('rotation', 0, v)} />}
        </div>
      </section>
      <section className="inspector__section">
        <label className="field field--inline inspector__check">
          <input
            type="checkbox"
            checked={light.castShadow}
            onChange={(e) => {
              const store = useDesignStore.getState()
              store.applyDesign(setShadowLight(store.design, light.id, e.target.checked))
            }}
          />
          <span className="field__label">Casts shadows</span>
        </label>
        <p className="inspector__note">
          {quality === 'low' ? 'One light at a time. Low quality draws no light shadows.' : 'One light at a time, beside the sun: turning this on turns it off elsewhere.'}
        </p>
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
