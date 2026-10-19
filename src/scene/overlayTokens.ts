// Editor overlay colours Three.js needs as values. Mirrors the overlay rows of
// src/styles/tokens.css; DESIGN.md is the source for both. Never scene materials.
export const overlayTokens = {
  /** Selection outline in the scene (coral = active / selected) */
  selection: '#FF8E6E',
  /** Scene wall edges, grid major lines */
  edge: '#8FD3CB',
  /** Ghosted floors, dashed */
  ghost: '#5E9A96',
  /** Fish-tank shader tint — the one deliberate crossover with the UI water token */
  water: '#39C6D6',
  /** Viewport background */
  ground: '#051A1E',
  gizmo: {
    x: '#FF6B6B',
    y: '#7EE081',
    z: '#6BA8FF',
  },
} as const
