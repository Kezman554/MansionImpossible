// Textures for library images, loaded from IndexedDB on first use and shared by every screen
// showing the same image (one texture and one material per image).
import { useEffect, useState } from 'react'
import { MeshBasicMaterial, SRGBColorSpace, Texture } from 'three'
import { getImage } from '../storage/imageStore'

const textures = new Map<string, Promise<Texture | null>>()
const materials = new Map<string, MeshBasicMaterial>()

function loadTexture(id: string): Promise<Texture | null> {
  let p = textures.get(id)
  if (!p) {
    p = (async () => {
      const image = await getImage(id)
      if (!image) return null
      const bitmap = await createImageBitmap(new Blob([image.data], { type: image.type }), { imageOrientation: 'flipY' })
      const texture = new Texture(bitmap)
      texture.flipY = false
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      return texture
    })().catch(() => null)
    textures.set(id, p)
  }
  return p
}

/**
 * A screen's picture as an unlit material (screens glow at night), or null while loading or when
 * the image isn't in the library.
 */
export function useImageMaterial(id: string | null): MeshBasicMaterial | null {
  // Bumped when a texture finishes loading, so the cached material is read again.
  const [, setLoaded] = useState(0)
  useEffect(() => {
    if (!id || materials.has(id)) return
    let live = true
    void loadTexture(id).then((texture) => {
      if (!texture) return
      // Several screens can wait on one image: the first makes its material, all re-render.
      if (!materials.has(id)) {
        const m = new MeshBasicMaterial({ map: texture, toneMapped: false })
        m.name = id
        materials.set(id, m)
      }
      if (live) setLoaded((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [id])
  return id ? (materials.get(id) ?? null) : null
}
