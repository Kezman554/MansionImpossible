import { create } from 'zustand'
import {
  DESIGN_SCHEMA_VERSION,
  type Design,
  type DesignObject,
  type ObjectKind,
  type Placed,
} from '../types/design'

/** Undo steps kept. Snapshots share unchanged objects, so each step is cheap. */
export const HISTORY_LIMIT = 100

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type Transform = Omit<Placed, 'id'>

/** An object to add: no id (one is generated), transform fields optional. */
export type NewObject = DistributiveOmit<DesignObject, keyof Placed> & Partial<Transform>

/** Fields to change on an existing object; id and kind are fixed. */
export type ObjectPatch = Partial<DistributiveOmit<DesignObject, 'id' | 'kind'>>

export interface EditOptions {
  /**
   * false = apply without adding an undo step. For continuous edits such as a
   * gizmo drag: call checkpoint() once when the drag starts, then update with
   * record: false, so the whole drag undoes in one step.
   */
  record?: boolean
}

const COLLECTION = { room: 'rooms', piece: 'pieces', furniture: 'furniture' } as const satisfies Record<
  ObjectKind,
  keyof Design
>

export const newId = (): string => crypto.randomUUID()
const now = (): string => new Date().toISOString()

export function createDesign(name: string): Design {
  const timestamp = now()
  const resolution = 65
  return {
    version: DESIGN_SCHEMA_VERSION,
    id: newId(),
    name,
    floors: [{ id: newId(), index: 0, name: 'Ground floor', elevation: 0, height: 3 }],
    rooms: [],
    pieces: [],
    furniture: [],
    terrain: { size: [200, 200], resolution, heights: new Array<number>(resolution * resolution).fill(0) },
    settings: { gridSize: 0.5, snapToGrid: true, timeOfDay: 12 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function findObject(design: Design, id: string): DesignObject | undefined {
  return design.rooms.find((o) => o.id === id) ?? design.pieces.find((o) => o.id === id) ?? design.furniture.find((o) => o.id === id)
}

export interface DesignState {
  design: Design
  /** Selected object ids. Not part of the design or its history. */
  selection: string[]
  past: Design[]
  future: Design[]

  /** Adds an object and returns its new id. */
  addObject: (input: NewObject, options?: EditOptions) => string
  updateObject: (id: string, patch: ObjectPatch, options?: EditOptions) => void
  /** Removes objects by id; unknown ids are ignored. One undo step for the lot. */
  removeObjects: (ids: string | string[]) => void
  select: (ids: string | string[], options?: { additive?: boolean }) => void
  clearSelection: () => void
  /**
   * Replaces the whole design with an edited copy as one undo step — for changes that touch
   * several collections at once, such as removing a floor and everything on it.
   */
  applyDesign: (next: Design, options?: EditOptions) => void
  /** Records the current design as an undo step without changing it. */
  checkpoint: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Replaces the design (open, import, new) and clears history and selection. */
  loadDesign: (design: Design) => void
}

/** State changes for an edit: stamps updatedAt, records history unless told not to. */
function edit(state: DesignState, next: Design, options?: EditOptions): Partial<DesignState> {
  const record = options?.record ?? true
  return {
    design: { ...next, updatedAt: now() },
    past: record ? [...state.past, state.design].slice(-HISTORY_LIMIT) : state.past,
    future: [],
  }
}

/** Drops ids that no longer exist in the design (after undo, redo or remove). */
function pruneSelection(design: Design, selection: string[]): string[] {
  return selection.filter((id) => findObject(design, id))
}

export const useDesignStore = create<DesignState>()((set, get) => ({
  design: createDesign('Untitled mansion'),
  selection: [],
  past: [],
  future: [],

  addObject: (input, options) => {
    const id = newId()
    const object = {
      floor: 0,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      ...input,
      id,
    } as DesignObject
    set((state) => {
      const key = COLLECTION[object.kind]
      const next = { ...state.design, [key]: [...state.design[key], object] }
      return edit(state, next, options)
    })
    return id
  },

  updateObject: (id, patch, options) => {
    set((state) => {
      const current = findObject(state.design, id)
      if (!current) return {}
      const key = COLLECTION[current.kind]
      const updated = { ...current, ...patch, id, kind: current.kind } as DesignObject
      const list = (state.design[key] as DesignObject[]).map((o) => (o.id === id ? updated : o))
      return edit(state, { ...state.design, [key]: list }, options)
    })
  },

  removeObjects: (ids) => {
    const remove = new Set(Array.isArray(ids) ? ids : [ids])
    set((state) => {
      const { design } = state
      if (![...remove].some((id) => findObject(design, id))) return {}
      const next: Design = {
        ...design,
        rooms: design.rooms.filter((o) => !remove.has(o.id)),
        pieces: design.pieces.filter((o) => !remove.has(o.id)),
        furniture: design.furniture.filter((o) => !remove.has(o.id)),
      }
      return { ...edit(state, next), selection: state.selection.filter((id) => !remove.has(id)) }
    })
  },

  select: (ids, options) => {
    set((state) => {
      const picked = (Array.isArray(ids) ? ids : [ids]).filter((id) => findObject(state.design, id))
      const selection = options?.additive ? [...new Set([...state.selection, ...picked])] : picked
      return { selection }
    })
  },

  clearSelection: () => set({ selection: [] }),

  applyDesign: (next, options) => {
    set((state) => {
      if (next === state.design) return {}
      return { ...edit(state, next, options), selection: pruneSelection(next, state.selection) }
    })
  },

  checkpoint: () => set((state) => edit(state, state.design)),

  undo: () => {
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return {}
      const design = { ...previous, updatedAt: now() }
      return {
        design,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future],
        selection: pruneSelection(design, state.selection),
      }
    })
  },

  redo: () => {
    set((state) => {
      const [following, ...rest] = state.future
      if (!following) return {}
      const design = { ...following, updatedAt: now() }
      return {
        design,
        past: [...state.past, state.design].slice(-HISTORY_LIMIT),
        future: rest,
        selection: pruneSelection(design, state.selection),
      }
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  loadDesign: (design) => set({ design, selection: [], past: [], future: [] }),
}))
