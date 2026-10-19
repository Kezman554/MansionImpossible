import { create } from 'zustand'
import type { Rect } from '../editor/roomTool'

export type Tool = 'select' | 'room'

/** Editor UI state: not part of the design, not undoable, not saved. */
interface EditorState {
  tool: Tool
  /** Floor index new rooms are drawn on. */
  activeFloor: number
  /** The rectangle being drawn with the room tool, if any. */
  draft: Rect | null
  /** True while a room is being moved or resized (the status bar shows its size). */
  dragging: boolean
  setTool: (tool: Tool) => void
  setDraft: (draft: Rect | null) => void
  setDragging: (dragging: boolean) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  tool: 'select',
  activeFloor: 0,
  draft: null,
  dragging: false,
  setTool: (tool) => set({ tool, draft: null }),
  setDraft: (draft) => set({ draft }),
  setDragging: (dragging) => set({ dragging }),
}))
