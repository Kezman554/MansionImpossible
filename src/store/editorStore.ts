import { create } from 'zustand'
import { OPENING_STYLES } from '../editor/openings'
import type { Rect } from '../editor/roomTool'
import type { Opening, OpeningStyle } from '../types/design'
import { useDesignStore } from './designStore'

export type Tool = 'select' | 'room' | 'door' | 'window'

/** An opening on a room, by id. Openings live inside their room, so they're selected here, not in the design store. */
export interface OpeningRef {
  roomId: string
  openingId: string
}

/** Editor UI state: not part of the design, not undoable, not saved. */
interface EditorState {
  tool: Tool
  /** The floor being edited: building tools only affect it; floors above hide. */
  activeFloor: number
  /** How floors below the active one show. */
  belowFloors: 'ghost' | 'hide'
  /** The rectangle being drawn with the room tool, if any. */
  draft: Rect | null
  /** True while a room or opening is being moved or resized. */
  dragging: boolean
  /** Style the door and window tools place. */
  openingStyle: OpeningStyle
  /** Where the door or window tool would place an opening right now. */
  openingPreview: { roomId: string; opening: Opening } | null
  selectedOpening: OpeningRef | null
  setTool: (tool: Tool) => void
  /** Switches the floor being edited; clears the selection, which belonged to the old floor. */
  setActiveFloor: (index: number) => void
  setBelowFloors: (mode: 'ghost' | 'hide') => void
  setDraft: (draft: Rect | null) => void
  setDragging: (dragging: boolean) => void
  setOpeningStyle: (style: OpeningStyle) => void
  setOpeningPreview: (preview: EditorState['openingPreview']) => void
  selectOpening: (ref: OpeningRef | null) => void
}

const DEFAULT_STYLE = { door: 'single-door', window: 'window' } as const

export const useEditorStore = create<EditorState>()((set, get) => ({
  tool: 'select',
  activeFloor: 0,
  belowFloors: 'ghost',
  draft: null,
  dragging: false,
  openingStyle: 'single-door',
  openingPreview: null,
  selectedOpening: null,

  setTool: (tool) => {
    // The door tool places doors and the window tool windows; keep the style in step.
    let { openingStyle } = get()
    if ((tool === 'door' || tool === 'window') && OPENING_STYLES[openingStyle].type !== tool) openingStyle = DEFAULT_STYLE[tool]
    set({ tool, draft: null, openingPreview: null, openingStyle })
  },
  setActiveFloor: (activeFloor) => {
    if (activeFloor === get().activeFloor) return
    useDesignStore.getState().clearSelection()
    set({ activeFloor, selectedOpening: null, openingPreview: null, draft: null })
  },
  setBelowFloors: (belowFloors) => set({ belowFloors }),
  setDraft: (draft) => set({ draft }),
  setDragging: (dragging) => set({ dragging }),
  setOpeningStyle: (openingStyle) => {
    const type = OPENING_STYLES[openingStyle].type
    set({ openingStyle, tool: get().tool === type ? get().tool : type, openingPreview: null })
  },
  setOpeningPreview: (openingPreview) => set({ openingPreview }),
  selectOpening: (selectedOpening) => set({ selectedOpening }),
}))
