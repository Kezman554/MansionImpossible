import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overlayTokens } from '../src/scene/overlayTokens'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

function cssToken(name: string): string {
  const match = css.match(new RegExp(String.raw`--${name}:\s*([^;]+);`))
  if (!match) throw new Error(`--${name} missing from tokens.css`)
  return match[1].trim().toLowerCase()
}

describe('design tokens', () => {
  it('defines every role-named DESIGN.md token', () => {
    for (const role of [
      'ground', 'surface', 'raised', 'border', 'text', 'text-secondary',
      'accent', 'on-accent', 'water', 'positive', 'danger', 'on-danger',
      'overlay-edge', 'overlay-ghost', 'gizmo-x', 'gizmo-y', 'gizmo-z',
    ]) {
      expect(cssToken(role)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('keeps overlayTokens.ts in step with tokens.css', () => {
    const pairs: [string, string][] = [
      ['accent', overlayTokens.selection],
      ['overlay-edge', overlayTokens.edge],
      ['overlay-ghost', overlayTokens.ghost],
      ['water', overlayTokens.water],
      ['ground', overlayTokens.ground],
      ['gizmo-x', overlayTokens.gizmo.x],
      ['gizmo-y', overlayTokens.gizmo.y],
      ['gizmo-z', overlayTokens.gizmo.z],
    ]
    for (const [role, value] of pairs) expect(value.toLowerCase()).toBe(cssToken(role))
  })

  it('bundles Bricolage Grotesque 400/500/700 locally', () => {
    for (const w of [400, 500, 700]) {
      expect(css).toContain(`@import '@fontsource/bricolage-grotesque/${w}.css'`)
    }
    expect(css).not.toMatch(/fonts\.googleapis|https?:\/\//)
  })
})
