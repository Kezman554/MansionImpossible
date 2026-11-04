// The image library: images uploaded for screens, in IndexedDB. Designs reference them by id.
// Exports carry the images a design uses (embedded, base64) so it opens complete elsewhere;
// importing stores them back in the library.
import { create } from 'zustand'
import type { Design } from '../types/design'
import { db, type StoredImage } from './designDb'

/** Longest side kept on upload, in pixels: plenty for a screen, small in storage. */
export const IMAGE_MAX_SIDE = 1280
/** Files under this size and within IMAGE_MAX_SIDE are kept as they are. */
const KEEP_BELOW_BYTES = 600_000

export type ImageMeta = Omit<StoredImage, 'data'>

/** An image as carried inside an exported design file. */
export interface EmbeddedImage extends ImageMeta {
  /** Base64 of the image bytes. */
  data: string
}

/** The size an image is scaled to so its longer side is at most `max` (never scaled up). */
export function fitWithin(width: number, height: number, max = IMAGE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Content id: the same picture uploaded twice is one library image. */
export async function imageId(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `img-${[...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Downscales large images (browser only): longer side to IMAGE_MAX_SIDE, re-encoded as JPEG. */
async function prepare(file: Blob): Promise<{ data: ArrayBuffer; type: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const size = fitWithin(bitmap.width, bitmap.height)
  if (size.width === bitmap.width && file.size <= KEEP_BELOW_BYTES) {
    bitmap.close()
    return { data: await file.arrayBuffer(), type: file.type || 'image/png', ...size }
  }
  const canvas = new OffscreenCanvas(size.width, size.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return { data: await blob.arrayBuffer(), type: 'image/jpeg', ...size }
}

/** Saves an image record (once per id). */
export async function putImage(image: StoredImage): Promise<void> {
  const store = await db()
  if (!(await store.getKey('images', image.id))) await store.put('images', image)
}

/** Uploads a file to the library (downscaled), returning its record. */
export async function addImage(file: Blob, name: string): Promise<ImageMeta> {
  const prepared = await prepare(file)
  const record: StoredImage = { id: await imageId(prepared.data), name, createdAt: new Date().toISOString(), ...prepared }
  await putImage(record)
  void useImageLibrary.getState().refresh()
  return withoutData(record)
}

function withoutData(image: StoredImage): ImageMeta {
  const meta: Partial<StoredImage> = { ...image }
  delete meta.data
  return meta as ImageMeta
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return (await db()).get('images', id)
}

export async function listImages(): Promise<ImageMeta[]> {
  return (await (await db()).getAll('images')).map(withoutData).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Image ids a design uses (screens), each once. */
export function imageIdsIn(design: Pick<Design, 'rooms'>): string[] {
  return [...new Set(design.rooms.flatMap((r) => r.screens?.images ?? []).filter((id): id is string => !!id))]
}

const toBase64 = (bytes: ArrayBuffer) => {
  const u8 = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromBase64 = (b64: string): ArrayBuffer => {
  const s = atob(b64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8.buffer
}

/** The images a design uses, ready to embed in an export (missing ones are skipped). */
export async function embeddedImagesFor(design: Pick<Design, 'rooms'>): Promise<EmbeddedImage[]> {
  const found = await Promise.all(imageIdsIn(design).map((id) => getImage(id)))
  return found.filter((i): i is StoredImage => !!i).map(({ data, ...meta }) => ({ ...meta, data: toBase64(data) }))
}

/** Stores images carried by an imported design file in the library. */
export async function storeEmbeddedImages(images: EmbeddedImage[]): Promise<void> {
  for (const { data, ...meta } of images) await putImage({ ...meta, data: fromBase64(data) })
  if (images.length) void useImageLibrary.getState().refresh()
}

/** The library as the UI sees it (names and sizes), refreshed after uploads and imports. */
export const useImageLibrary = create<{ images: ImageMeta[]; refresh: () => Promise<void> }>()((set) => ({
  images: [],
  refresh: async () => set({ images: await listImages() }),
}))
