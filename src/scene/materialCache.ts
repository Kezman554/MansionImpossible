// Shared scene material instances: one MeshStandardMaterial per material and variant for the
// whole scene, so painting never multiplies materials (and meshes merged per material stay
// one draw call each). Textures are generated once per pattern and scale. Nothing here is
// disposed: the set is small and bounded by the catalogue plus the design's custom colours.
import { DataTexture, DoubleSide, FrontSide, MeshBasicMaterial, MeshStandardMaterial, Plane, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { resolveMaterial, type SceneMaterial } from '../editor/catalog/materials'
import { TEXTURE_SIZE, texturePixels, type TextureKind } from '../editor/catalog/textures'
import type { CustomMaterial } from '../types/design'
import { overlayTokens } from './overlayTokens'

/**
 * Cuts connectors off at the top of the floor being edited (floors above are hidden). One
 * plane shared by every clipped material; Connectors moves it when the active floor changes.
 */
export const activeFloorClip = new Plane(new Vector3(0, -1, 0), 0)

export interface MaterialVariant {
  doubleSided?: boolean
  /** Clipped at activeFloorClip. */
  clipped?: boolean
}

const textures = new Map<string, DataTexture>()
const materials = new Map<string, MeshStandardMaterial>()

/** The generated pattern, repeating every `scale` metres on world-scale UVs (see worldUVs). */
export function patternTexture(kind: TextureKind, scale: number): DataTexture {
  const key = `${kind}|${scale}`
  let texture = textures.get(key)
  if (!texture) {
    texture = new DataTexture(texturePixels(kind), TEXTURE_SIZE, TEXTURE_SIZE)
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(1 / scale, 1 / scale)
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = true
    texture.needsUpdate = true
    textures.set(key, texture)
  }
  return texture
}

function build(m: SceneMaterial, variant: MaterialVariant): MeshStandardMaterial {
  const seeThrough = m.opacity !== undefined && m.opacity < 1
  const material = new MeshStandardMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness ?? 0,
    transparent: seeThrough,
    opacity: m.opacity ?? 1,
    depthWrite: !seeThrough,
    side: variant.doubleSided || seeThrough ? DoubleSide : FrontSide,
    map: m.texture ? patternTexture(m.texture.kind, m.texture.scale) : null,
    clippingPlanes: variant.clipped ? [activeFloorClip] : null,
  })
  material.name = m.id
  return material
}

/** The shared instance for a material (by definition) and variant. */
export function sharedMaterial(m: SceneMaterial, variant: MaterialVariant = {}): MeshStandardMaterial {
  const key = `${m.id}|${m.color}|${variant.doubleSided ? 2 : 1}|${variant.clipped ? 'clip' : ''}`
  let material = materials.get(key)
  if (!material) {
    material = build(m, variant)
    materials.set(key, material)
  }
  return material
}

/** The shared instance for a material id (catalogue or custom); unknown ids fall back to `fallback`. */
export function sharedMaterialById(id: string | null | undefined, custom: readonly CustomMaterial[], fallback: string, variant?: MaterialVariant): MeshStandardMaterial {
  const m = resolveMaterial(id, custom) ?? resolveMaterial(fallback)!
  return sharedMaterial(m, variant)
}

/** Stand-in for a design without custom colours (a stable reference for memos). */
export const NO_CUSTOM: readonly CustomMaterial[] = []

/** Ghosted floors' see-through overlay, shared by every ghosted mesh. */
export const ghostMaterial = new MeshBasicMaterial({ color: overlayTokens.ghost, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, side: DoubleSide })

/** Scene-wide counts, for tests and the dev console. */
export const materialCacheSize = () => ({ materials: materials.size, textures: textures.size })
