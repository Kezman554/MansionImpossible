import { ToolIcon } from './icons'

interface Tool {
  id: string
  label: string
  built: boolean
}

// Groups: build, furnish, grounds. Unbuilt tools stay visible but disabled.
const TOOL_GROUPS: Tool[][] = [
  [
    { id: 'select', label: 'Select', built: true },
    { id: 'room', label: 'Room', built: false },
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
  const active = 'select'

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
              title={tool.built ? tool.label : `${tool.label} — coming soon`}
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
