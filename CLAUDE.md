# Project: Mansion Impossible

A browser-based 3D builder for designing fantasy super mansions with no real-world limits.
Built with Vite + React + TypeScript (PWA), React Three Fiber (Three.js) + drei, Zustand and IndexedDB (idb). Tests with Vitest.

## Structure
- src/scene/ - 3D scene, cameras, lighting, rendering, editor overlays
- src/editor/ - building tools (rooms, freeform pieces, terrain) and catalogues
- src/components/ - UI panels, toolbars, menus, dialogs
- src/store/ - Zustand stores and undo/redo
- src/storage/ - IndexedDB persistence for designs and uploaded images
- public/models/ - low-poly glTF/GLB assets; docs/ - PRD and progress log

## Commands
- `npm run dev` - Run the app
- `npm test` - Run tests (Vitest)
- `npm run build` - Production build; `npm run preview` serves it (the MVP runs locally, no hosting)

## Git
- Do not push to GitHub without explicit permission
- Commit after completing each session
- Update docs/progress.txt briefly if significant work was done

## Conventions
- All geometry and measurements in real-world metres (1 unit = 1 m)
- Performance first: target 60fps on integrated laptop graphics
- Use instancing for repeated objects and LOD for distant ones
- Keep shadow-casting lights to one or two; respect the quality setting
- Low-poly stylised assets only; keep models lightweight
- No architectural rules enforced in default mode
- Design data is plain serialisable JSON so it can be saved, loaded and checked later
- Anything undoable is deleted without a confirm (Undo toast instead); only deleting a whole design confirms

## Design
- Read DESIGN.md before any UI work — its palette is for the chrome and editor overlays, never scene materials
- No colour, font or radius literal outside `src/styles/tokens.css` and `src/scene/overlayTokens.ts`; check with `npm run lint:tokens` (CSS) and `npm run check:literals` (TS/TSX) — both defined in DESIGN.md's Enforcement section

## Reference
- Requirements: docs/mansion-impossible_PRD.md
- Design: DESIGN.md
- Progress log: docs/progress.txt
- Task prompts: Kanban app
