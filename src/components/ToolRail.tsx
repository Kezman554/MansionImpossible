import { useEditorStore, type Tool as ToolId } from '../store/editorStore'
import { ToolIcon } from './icons'

interface Tool {
  id: string
  label: string
  built: boolean
  /** Keyboard shortcut, shown in the tooltip. */
  key?: string
}

// Groups: build, furnish, grounds. Unbuilt tools stay visible but disabled.
const TOOL_GROUPS: Tool[][] = [
  [
    { id: 'select', label: 'Select', built: true, key: 'V' },
    { id: 'room', label: 'Room', built: true, key: 'R' },
    { id: 'door', label: 'Door', built: false },
    { id: 'window', label: 'Window', built: false },
    { id: 'freeform', label: 'Freeform', built: false },
    { id: 'stairs', label: 'Stairs', built: false },
  ],
  [
    { id: 'furnish', label: 'Furnish', built: false },
    { id: 'materials', label: 'Materials', built: false },
    { id: 'lights', label: 'Lights', built: false },
  ],
  [
    { id: 'terrain', label: 'Terrain', built: false },
    { id: 'water', label: 'Water', built: false },
    { id: 'gardens', label: 'Gardens', built: false },
  ],
]

export function ToolRail() {
  const active = useEditorStore((s) => s.tool)

  return (
    <nav aria-label="Tools" className="tool-rail">
      {TOOL_GROUPS.map((group, i) => (
        <div key={i} className="tool-rail__group">
          {group.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="tool-rail__tool"
              aria-pressed={tool.id === active}
              disabled={!tool.built}
              title={tool.built ? `${tool.label} (${tool.key})` : `${tool.label} — coming soon`}
              onClick={() => useEditorStore.getState().setTool(tool.id as ToolId)}
            >
              <ToolIcon tool={tool.id} />
              {tool.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
