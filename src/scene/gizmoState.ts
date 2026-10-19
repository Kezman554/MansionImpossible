// Whether the transform gizmo has a handle under the pointer. The gizmo takes its own pointer
// events, but a click on it would otherwise also reach whatever lies behind it in the scene
// (clearing the selection, picking a room, placing a piece).
export const gizmoState = { axis: null as string | null }

export const gizmoHasPointer = () => gizmoState.axis !== null
