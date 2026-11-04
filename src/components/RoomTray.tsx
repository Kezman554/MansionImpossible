import { useEditorStore } from '../store/editorStore'
import { SegmentedControl } from './SegmentedControl'

const SHAPES: { value: 'rectangular' | 'round'; label: string }[] = [
  { value: 'rectangular', label: 'Rectangular' },
  { value: 'round', label: 'Round' },
]

/** Catalogue tray for the room tool: the shape to draw. */
export function RoomTray() {
  const tool = useEditorStore((s) => s.tool)
  const shape = useEditorStore((s) => s.roomShape)
  if (tool !== 'room') return null
  return (
    <section aria-label="Room shape" className="tray">
      <div className="tray__head">
        <span className="tray__title">Rooms</span>
        <span className="tray__hint">{shape === 'round' ? 'Drag across the floor: the circle fits the larger side' : 'Drag a rectangle on the floor'}</span>
        <SegmentedControl label="Shape" segments={SHAPES} value={shape} onChange={(s) => useEditorStore.getState().setRoomShape(s)} />
      </div>
    </section>
  )
}
