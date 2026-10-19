# Mansion Impossible - Product Requirements Document

Version: 1.0
Last Updated: 2026-10-19
GitHub: https://github.com/Kezman554/MansionImpossible

## Overview

### Problem Statement
Existing building tools are either too basic (Minecraft) or built for real architecture, with rules and constraints. Mansion Impossible is a browser-based 3D builder for designing fantasy super mansions purely for fun, with no requirement that they could ever be built.

### Goals
- Total creative freedom to design dream mansions and their grounds
- Smooth performance (target 60fps) on a basic laptop with integrated graphics
- Multiple saved designs, stored locally in the browser
- Real-world units throughout, so a feasibility mode can be added later without a rewrite

### Target Users
Nick, designing personal dream mansions for fun at a desk. Later phases add a mode for people preparing a design brief for architects.

## Features

### Building (Hybrid)
- Room drawing: drag a rectangle on the grid to create a room with walls, floor and ceiling
- Doors and windows as openings in walls
- Freeform pieces at any position, rotation and height (wall segments, floor panels, domes, tubes, platforms, pillars)
- Multiple floors, including basements, with inactive floors ghosted or hidden

### Signature Features
- Giant central fish tank running through all floors; rooms built against it get aquarium walls
- Animated low-poly fish
- Bookcase secret passages
- Round brainstorming room with floor-to-ceiling screens showing static images
- Stairs, elevators, slides and fireman's poles as placeable pieces

### Furnishing
- Low-poly furniture catalogue
- Materials and textures per surface
- Placeable lighting and a day/night cycle

### Grounds
- Terrain sculpting (raise, lower, flatten, smooth)
- Water: lakes, pools, moats
- Landscaping catalogue (trees, gardens, paths, helipad and similar)

### Viewing
- Editor orbit camera
- First-person walkthrough
- Fly-through camera tours
- Overhead dollhouse cutaway view

### Saving
- Multiple named designs saved in IndexedDB
- Create, open, rename, duplicate and delete designs; JSON export/import for backups

## Scope

### In Scope
- Phases 1-3: core builder, grounds, viewing modes (MVP)
- Phases 4-6 as later phases on the same board (see Future Considerations)

### Out of Scope
- Hosting for the MVP: it runs locally (`npm run preview` or the installed PWA)
- Cloud saves, accounts, sharing links
- Architect-grade drawings, structural calculations, building regulations
- Electron or native desktop builds
- Multiplayer or collaborative editing

### Future Considerations
- Phase 4: Interactive features - ride slides and poles, working elevators, opening bookcases
- Phase 5: Reality Check mode (feasibility warnings toggle) and Tender Pack PDF export for architects
- Phase 6: Optional AI layout assistant via the Claude API
- Public hosting, if wanted later

## Technical

### Stack
- Vite + React + TypeScript: app framework, installable PWA
- React Three Fiber (Three.js) + drei: 3D rendering and helpers
- Zustand: app and design state, undo/redo
- IndexedDB (idb): local storage for designs and uploaded images
- Vitest: tests

### Integrations
- None for the MVP
- Anthropic Claude API: Phase 6 only, key entered by the user in app settings and stored locally

### Constraints
- Must run smoothly on integrated graphics: low-poly assets, instancing, level of detail, limited shadow-casting lights, quality setting (low/medium/high)
- All geometry and measurements in real-world metres (1 unit = 1 m)
- No architectural rules enforced in default mode
- Design data is plain serialisable JSON
- Fully offline-capable after first load

### Design
- Display: Nick's laptop, sometimes docked to an external monitor; known hardware, two screen sizes
- Use: at a desk, arm's length, full attention, mouse/trackpad and keyboard
- Most-looked-at element: the 3D viewport; UI chrome must recede around it
- Modes: dark only; user choices: quality setting only
- Contrast: text 4.5:1, non-text 3:1

## Screens
- Start screen: list of saved mansions with create, open, rename, duplicate, delete
- Editor: full-bleed 3D viewport with toolbars, tool palettes and an inspector panel
- Catalogue panel: searchable, categorised thumbnails (furniture, pieces, landscaping, materials)
- Immersive view: first-person, tour playback and presentation mode with UI hidden
- Settings / dialog: quality, uploads, confirmations

## Project Structure

```
MansionImpossible/
├── docs/
│   ├── mansion-impossible_PRD.md
│   └── progress.txt
├── CLAUDE.md
├── DESIGN.md
├── public/
│   └── models/
├── src/
│   ├── components/
│   ├── scene/
│   ├── editor/
│   ├── store/
│   ├── storage/
│   └── types/
└── tests/
```

## Success Criteria

- [ ] Can create, save, reopen and delete multiple mansion designs
- [ ] Can draw rooms, add doors and windows, and place freeform pieces on multiple floors
- [ ] Central fish tank spans all floors and adjoining rooms show aquarium walls
- [ ] All signature pieces can be placed
- [ ] Terrain can be sculpted and landscaped
- [ ] First-person, fly-through and dollhouse views all work
- [ ] Holds roughly 60fps on Nick's laptop with a large mansion at low/medium quality
- [ ] Installs as a PWA and works offline
