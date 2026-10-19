# Mansion Impossible — Design

Status: provisional. Values hold until judged on Nick's laptop screen and his external monitor.
Canvas: https://claude.ai/artifact/CsmCamM8NbpHZJAwm1iEZX (direction C, "The tank", plus start screen, empty state, dialogs and states)

## Purpose and conditions of use
- Display: Nick's laptop, sometimes docked to an external monitor. Known hardware, two sizes; design at 1440×900 and check both
- Use: at a desk, arm's length, full attention, mouse/trackpad + keyboard
- Looked at most: the 3D viewport. The chrome recedes around it
- Modes: dark only; user choices: quality (Low / Med / High) — nothing visual

## Direction
The interface is the deep water around the fish tank — the app's signature feature — with coral as the one thing that says "you, here, now". Chosen on the canvas: C whole, with no composite.

## The scene is not the chrome
- **The 3D scene is full-colour, lit and textured.** Walls, floors and furniture take their own materials (marble is marble). The palette below never tints scene materials.
- The palette covers the chrome **and the editor overlays drawn into the scene**: selection outline, grid, ghosted floors, transform gizmo, hover.
- One deliberate crossover: the UI `water` token and the fish-tank shader's tint are the same colour.

## Tokens
Typeface: Bricolage Grotesque, weights 400 / 500 / 700, bundled with `@fontsource` (never fetched).

| Role | Dark (only mode) |
|---|---|
| ground (viewport background, deepest) | `#051A1E` |
| surface (app chrome, panels over the viewport) | `#072328` |
| raised (inputs, tiles, rails, inspector) | `#0C2F35` |
| border (decorative only, never a state) | `#1B4850` |
| text | `#E3F5F2` |
| text-secondary | `#86B3AD` |
| accent / on-accent | `#FF8E6E` / `#2B0E06` |
| water (tank, aquarium walls, water tools) | `#39C6D6` |
| positive (saved tick) | `#7EE0A8` |
| danger / on-danger | `#FF8FA8` / `#2E0812` |
| overlay-edge (scene wall edges, grid major) | `#8FD3CB` |
| overlay-ghost (ghosted floors, dashed) | `#5E9A96` |
| gizmo x / y / z | `#FF6B6B` / `#7EE081` / `#6BA8FF` |

Shadows and dims are tinted toward ground (`#02100F` / `#03100F`), never black.

## Geometry: prohibitions
- Never a sharp corner on chrome: panels 12px, tiles and inputs 8–10px, buttons and segmented controls fully rounded (pills)
- Never a hairline border to separate chrome regions; separate with surface vs raised and gaps (8px between rail, viewport, inspector)
- Never a gradient, a glass blur or an emoji
- Never a sticky or floating panel over the viewport that is not one of: floor gauge (top-left), fps (top-right), catalogue tray (bottom)

## What colour means
- **Coral = active / selected / primary action.** Active tool, active view mode, selection outline in the scene, the one primary button per view
- **Water = the tank and anything that became aquarium** (aquarium walls, the floor gauge's tube, water tools)
- **Danger is carried by wording + the bin icon + an outline, never colour alone.** Coral and danger pink measure 1.04:1 against each other — indistinguishable by colour, by design accepted
- Deleting anything undoable (room, piece, furniture) never asks: it's one undo step and a toast offers Undo. Only deleting a whole mansion confirms, and offers "Export first"
- Save failure is a persistent banner (danger outline, plain panel), not a toast

## Contrast
- Text 4.5:1 and non-text 3:1, with a margin. Measured by script on 19 Oct: text 12.6–15.9:1; text-secondary 6.2–7.1:1; accent 6.3–8.0:1; danger 6.6–7.6:1; water 6.9–8.0:1; on-accent 8.0:1; on-danger 8.4:1
- `border` is 1.6:1 on surface — decorative only. Any outline that signals a state uses accent, danger or water
- No coloured text on translucent tints

## Enforcement
- No colour, font or radius literal outside `src/styles/tokens.css` (chrome) and `src/scene/overlayTokens.ts` (overlay colours Three.js needs as values). Material/catalogue colours are design data and live in their catalogues
- CSS: stylelint with `declaration-strict-value` on `color`, `background`, `background-color`, `border`, `border-color`, `outline`, `box-shadow`, `fill`, `stroke`, `font`, `font-family`, `border-radius` — `var(` passes, literals fail
- TS/TSX: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src --include=*.ts --include=*.tsx | grep -vE "src/scene/overlayTokens.ts|src/editor/.*catalog"` prints nothing
- Both checks proven both ways: silent on the real code, and each catches one planted literal of each kind
- No UI-kit defaults inherited: no component library theme; tokens are CSS custom properties defined once

## Icon
Not yet picked; needs its own round before the icon card starts. The canvas's stand-in (a rounded tank with a water line and a coral fish) is a placeholder, not a choice. One source drawing generates every icon (favicon, PWA 192/512, maskable, apple-touch).

## Not settled here
This file does not settle the palette. Rendering it next to a real lit Three.js scene, on the laptop and on the monitor, does.
