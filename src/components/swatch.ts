// Swatch images for the paint picker: a material's generated pattern tinted with its colour,
// drawn once to a small canvas and kept as a data URL.
import type { SceneMaterial } from '../editor/catalog/materials'
import { TEXTURE_SIZE, texturePixels } from '../editor/catalog/textures'

const cache = new Map<string, string>()

/** CSS background for a material's swatch: its tinted pattern, or its flat colour. */
export function swatchBackground(m: SceneMaterial): string {
  if (!m.texture) return m.color
  const key = `${m.texture.kind}|${m.color}`
  let url = cache.get(key)
  if (!url) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TEXTURE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return m.color
    const grey = texturePixels(m.texture.kind)
    const tint = [1, 3, 5].map((i) => parseInt(m.color.slice(i, i + 2), 16))
    const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE)
    for (let i = 0; i < grey.length; i += 4) {
      for (let c = 0; c < 3; c++) image.data[i + c] = (grey[i + c] * tint[c]) / 255
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    url = `url(${canvas.toDataURL()})`
    cache.set(key, url)
  }
  return url
}
