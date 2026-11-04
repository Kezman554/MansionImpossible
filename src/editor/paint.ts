// The paint tool: apply a material to one surface. Pure functions over the design, so each
// click is one applyDesign — one undo step — and painting a surface with the material it
// already has changes nothing (no empty undo step).
import { CUSTOM_PREFIX, customMaterial, resolveMaterial } from './catalog/materials'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Design, WallFace } from '../types/design'

export type PaintTarget =
  | { kind: 'wall'; roomId: string; face: WallFace }
  | { kind: 'floor'; roomId: string }
  | { kind: 'ceiling'; roomId: string }
  | { kind: 'piece'; pieceId: string }

/** The material id a surface has been given (null = its default). */
export function paintedMaterial(design: Design, target: PaintTarget): string | null {
  if (target.kind === 'piece') return design.pieces.find((p) => p.id === target.pieceId)?.material ?? null
  const room = design.rooms.find((r) => r.id === target.roomId)
  if (!room) return null
  if (target.kind === 'wall') return room.materials.faces?.[target.face] ?? room.materials.walls
  return room.materials[target.kind]
}

/**
 * The design with one surface painted. A custom colour not yet in the design is added to its
 * custom materials in the same step. Unknown materials or targets leave the design unchanged.
 */
export function paintDesign(design: Design, target: PaintTarget, materialId: string): Design {
  const custom = design.customMaterials ?? []
  if (!resolveMaterial(materialId, custom)) return design
  if (paintedMaterial(design, target) === materialId) return design

  let next: Design = design
  if (materialId.startsWith(CUSTOM_PREFIX) && !custom.some((m) => m.id === materialId)) {
    next = { ...next, customMaterials: [...custom, customMaterial(materialId.slice(CUSTOM_PREFIX.length))] }
  }
  if (target.kind === 'piece') {
    if (!next.pieces.some((p) => p.id === target.pieceId)) return design
    return { ...next, pieces: next.pieces.map((p) => (p.id === target.pieceId ? { ...p, material: materialId } : p)) }
  }
  if (!next.rooms.some((r) => r.id === target.roomId)) return design
  return {
    ...next,
    rooms: next.rooms.map((r) => {
      if (r.id !== target.roomId) return r
      const m = r.materials
      return {
        ...r,
        materials: target.kind === 'wall' ? { ...m, faces: { ...(m.faces ?? {}), [target.face]: materialId } } : { ...m, [target.kind]: materialId },
      }
    }),
  }
}

/** Paints a surface with the paint tool's material: one undo step, none if nothing changes. */
export function applyPaint(target: PaintTarget): void {
  const store = useDesignStore.getState()
  const next = paintDesign(store.design, target, useEditorStore.getState().paintMaterial)
  if (next !== store.design) store.applyDesign(next)
}
