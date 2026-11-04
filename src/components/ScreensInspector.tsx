import { useEffect, useRef, useState } from 'react'
import { maxScreens, setScreenCount, setScreenImage } from '../editor/roundRoom'
import { addImage, getImage, useImageLibrary } from '../storage/imageStore'
import { useAppStore } from '../store/appStore'
import { useDesignStore } from '../store/designStore'
import type { Room } from '../types/design'
import { NumberField } from './NumberField'

const urls = new Map<string, Promise<string | null>>()

/** An object URL for a library image's thumbnail (made once per image). */
function useImageUrl(id: string | null): string | null {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    let p = urls.get(id)
    if (!p) {
      p = getImage(id).then((img) => (img ? URL.createObjectURL(new Blob([img.data], { type: img.type })) : null))
      urls.set(id, p)
    }
    let live = true
    void p.then((u) => live && setUrl({ id, url: u }))
    return () => {
      live = false
    }
  }, [id])
  return id && url?.id === id ? url.url : null
}

function Thumb({ id }: { id: string | null }) {
  const url = useImageUrl(id)
  return url ? <img className="screen-row__thumb" src={url} alt="" /> : <span className="screen-row__thumb screen-row__thumb--blank" aria-hidden="true" />
}

/**
 * A round room's screens: how many, and the image on each. Uploads go to the image library
 * (IndexedDB, downscaled); the room stores only image ids. Each change is one undo step.
 */
export function ScreensInspector({ room }: { room: Room }) {
  const library = useImageLibrary((s) => s.images)
  const input = useRef<HTMLInputElement>(null)
  const update = (patch: Partial<Room>) => useDesignStore.getState().updateObject(room.id, patch)
  const count = room.screens?.count ?? 0
  const images = room.screens?.images ?? []
  useEffect(() => {
    void useImageLibrary.getState().refresh()
  }, [])

  /** Adds the files to the library and puts them on the screens without an image, in order (one undo step). */
  const upload = async (files: FileList) => {
    const added = []
    for (const file of [...files]) {
      try {
        added.push(await addImage(file, file.name))
      } catch {
        useAppStore.getState().showToast(`Couldn't read ${file.name} as an image`)
      }
    }
    const current = useDesignStore.getState().design.rooms.find((r) => r.id === room.id)
    if (!current || added.length === 0) return
    let next = current
    for (const image of added) {
      const free = Array.from({ length: next.screens?.count ?? 0 }, (_, i) => i).find((i) => !next.screens?.images[i])
      if (free === undefined) break
      next = { ...next, ...setScreenImage(next, free, image.id) }
    }
    if (next !== current) update({ screens: next.screens })
  }

  return (
    <section className="inspector__section">
      <div className="inspector__eyebrow">Screens · floor to ceiling</div>
      <div className="field-grid">
        <NumberField label="Screens" value={count} title={`Up to ${maxScreens(room)} fit this room`} onCommit={(v) => update(setScreenCount(room, v))} />
      </div>
      {count > 0 && (
        <ol className="screen-rows" aria-label="Screen images">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="screen-row">
              <Thumb id={images[i] ?? null} />
              <select
                className="field__input field__select"
                aria-label={`Screen ${i + 1} image`}
                value={images[i] ?? ''}
                onChange={(e) => update(setScreenImage(room, i, e.target.value || null))}
              >
                <option value="">Screen {i + 1} · blank</option>
                {library.map((img) => (
                  <option key={img.id} value={img.id}>
                    Screen {i + 1} · {img.name}
                  </option>
                ))}
                {images[i] && !library.some((img) => img.id === images[i]) && <option value={images[i]!}>Screen {i + 1} · missing image</option>}
              </select>
            </li>
          ))}
        </ol>
      )}
      <div className="inspector__actions">
        <button type="button" className="btn btn--small btn--on-raised" onClick={() => input.current?.click()}>
          Upload images…
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload screen images"
          onChange={(e) => {
            const files = e.target.files
            if (files?.length) void upload(files).finally(() => (e.target.value = ''))
          }}
        />
      </div>
      <p className="inspector__note">Large images are scaled down. They're kept in this browser and travel inside exported designs.</p>
    </section>
  )
}
