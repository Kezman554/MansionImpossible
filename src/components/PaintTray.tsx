import { useState } from 'react'
import { customMaterial, MATERIAL_CATEGORIES, pickableMaterials, resolveMaterial, type MaterialCategory, type SceneMaterial } from '../editor/catalog/materials'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { SegmentedControl } from './SegmentedControl'
import { swatchBackground } from './swatch'

type Tab = MaterialCategory | 'custom'
const TABS: { value: Tab; label: string }[] = [...MATERIAL_CATEGORIES.map((c) => ({ value: c.id as Tab, label: c.label })), { value: 'custom', label: 'Custom' }]

function Swatch({ m, active }: { m: SceneMaterial; active: boolean }) {
  return (
    <button type="button" className="tray__tile tray__tile--swatch" aria-pressed={active} title={m.name} onClick={() => useEditorStore.getState().setPaintMaterial(m.id)}>
      {/* Scene colours are design data (the catalogue or the design's custom colours), never chrome tokens. */}
      <span className="tray__swatch" style={{ background: swatchBackground(m) }} aria-hidden="true" />
      {m.name}
    </button>
  )
}

/**
 * Catalogue tray for the paint tool: the material library by kind, and a custom colour picker.
 * Click a wall face, a floor or a piece to paint it; Shift-click a floor paints its ceiling.
 */
export function PaintTray() {
  const tool = useEditorStore((s) => s.tool)
  const paintMaterial = useEditorStore((s) => s.paintMaterial)
  const colour = useEditorStore((s) => s.customColour)
  const custom = useDesignStore((s) => s.design.customMaterials)
  const current = resolveMaterial(paintMaterial, custom)
  const [tab, setTab] = useState<Tab>(current?.id.startsWith('custom-') ? 'custom' : (current?.category ?? 'marble'))
  if (tool !== 'paint') return null

  const mixed = customMaterial(colour)
  const saved = (custom ?? []).filter((m) => m.id !== mixed.id)

  return (
    <section aria-label="Materials" className="tray">
      <div className="tray__head">
        <span className="tray__title">Materials</span>
        <span className="tray__hint">Click a wall face, floor or piece to paint it · Shift-click a floor for its ceiling</span>
        <span className="tray__hint tray__current">{current ? `Painting with ${current.name}` : ''}</span>
      </div>
      <SegmentedControl label="Material kind" segments={TABS} value={tab} onChange={setTab} />
      <div className="tray__tiles tray__tiles--swatches" role="group" aria-label="Material">
        {tab === 'custom' ? (
          <>
            <label className="tray__tile tray__tile--swatch tray__colour">
              <input
                type="color"
                aria-label="Custom colour"
                value={colour}
                onChange={(e) => {
                  useEditorStore.getState().setCustomColour(e.target.value)
                  useEditorStore.getState().setPaintMaterial(customMaterial(e.target.value).id)
                }}
              />
              Pick a colour
            </label>
            <Swatch m={{ ...mixed, category: 'plain' }} active={paintMaterial === mixed.id} />
            {saved.map((m) => (
              <Swatch key={m.id} m={{ ...m, category: 'plain' }} active={paintMaterial === m.id} />
            ))}
          </>
        ) : (
          pickableMaterials(tab).map((m) => <Swatch key={m.id} m={m} active={paintMaterial === m.id} />)
        )}
      </div>
    </section>
  )
}
