import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  createNewDesign,
  deleteDesign,
  duplicateDesign,
  getDesign,
  importDesign,
  listDesigns,
  renameDesign,
  type DesignSummary,
} from '../storage/designDb'
import { DesignFileError, downloadDesign, parseDesign } from '../storage/designFile'
import { useAppStore } from '../store/appStore'
import type { Design } from '../types/design'
import { DeleteDesignDialog } from './DeleteDesignDialog'
import { DesignCard } from './DesignCard'
import { plural } from './formatEdited'
import { SaveBanner } from './SaveBanner'
import './DesignManager.css'

interface DesignManagerProps {
  onOpen: (id: string) => void
}

/** Start screen: saved mansions as cards, or an empty state. */
export function DesignManager({ onOpen }: DesignManagerProps) {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DesignSummary | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { showToast, reportSaveProblem, clearSaveProblem } = useAppStore.getState()

  const refresh = useCallback(() => listDesigns().then(setDesigns), [])
  useEffect(() => void refresh(), [refresh])

  const toggleMenu = useCallback((id: string, open: boolean) => setMenuFor((current) => (open ? id : current === id ? null : current)), [])

  /** Runs a write; on failure raises the save banner, whose Try again reruns it. */
  async function write<T>(operation: () => Promise<T>, design: Design | null = null): Promise<T | undefined> {
    try {
      const result = await operation()
      clearSaveProblem()
      await refresh()
      return result
    } catch (error) {
      reportSaveProblem(error, design, () => void write(operation, design))
      return undefined
    }
  }

  const exportDesign = async (id: string) => {
    const design = await getDesign(id)
    if (design) downloadDesign(design)
  }

  const onNew = async () => {
    const design = await write(createNewDesign)
    if (design) onOpen(design.id)
  }

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    let design: Design
    try {
      design = parseDesign(await file.text())
    } catch (error) {
      showToast(error instanceof DesignFileError ? `Couldn't import — ${error.message}` : "Couldn't read that file")
      return
    }
    const imported = await write(() => importDesign(design), design)
    if (imported) showToast(`Imported ${imported.name}`)
  }

  const cardActions = {
    onOpen,
    onRename: (id: string, name: string) => void write(() => renameDesign(id, name)),
    onDuplicate: async (id: string) => {
      const copy = await write(() => duplicateDesign(id))
      if (copy) showToast(`Duplicated as ${copy.name}`)
    },
    onExport: (id: string) => void exportDesign(id),
    onDelete: setDeleting,
  }

  const onConfirmDelete = async () => {
    if (!deleting) return
    const { id, name } = deleting
    setDeleting(null)
    const deleted = await write(async () => {
      await deleteDesign(id)
      return true
    })
    if (deleted) showToast(`${name} deleted`)
  }

  const importButton = (large: boolean) => (
    <button type="button" className={large ? 'btn btn--large' : 'btn'} onClick={() => fileInput.current?.click()}>
      Import JSON
    </button>
  )
  const newButton = (large: boolean) => (
    <button type="button" className={large ? 'btn btn--large btn--primary' : 'btn btn--primary'} onClick={() => void onNew()}>
      + New mansion
    </button>
  )

  return (
    <div className="start">
      <header className="start__bar">
        <span className="start__wordmark">Mansion Impossible</span>
      </header>
      <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onImportFile(e)} />

      <div className="start__banner">
        <SaveBanner />
      </div>

      {designs === null ? null : designs.length === 0 ? (
        <main className="start__empty">
          <svg className="start__empty-art" width="180" height="200" viewBox="0 0 180 200" aria-hidden="true">
            <polygon className="start__empty-plot" points="90,110 170,150 90,190 10,150" />
            <path className="start__empty-tank" d="M50 40 V150 A40 16 0 0 0 130 150 V40" />
            <ellipse className="start__empty-rim" cx="90" cy="40" rx="40" ry="16" />
            <path className="start__empty-water" d="M50 120 C 66 128, 80 112, 90 120 S 114 128, 130 120 V150 A40 16 0 0 1 50 150 Z" />
            <path className="start__empty-fish" d="M78 98 l16 -7 v14 z M96 98 l-6 4 6 4 z" />
          </svg>
          <h1 className="start__empty-title">No mansions yet</h1>
          <p className="start__empty-text">Start one on an empty plot, or bring back a design you exported earlier.</p>
          <div className="start__empty-actions">
            {newButton(true)}
            {importButton(true)}
          </div>
          <p className="start__footnote">Designs are kept in this browser only. Export a copy to back one up.</p>
        </main>
      ) : (
        <main className="start__main">
          <div className="start__heading">
            <div>
              <h1 className="start__title">My mansions</h1>
              <div className="start__subtitle">{plural(designs.length, 'design')} · saved in this browser</div>
            </div>
            <div className="start__actions">
              {importButton(false)}
              {newButton(false)}
            </div>
          </div>
          <div className="start__grid">
            {designs.map((summary) => (
              <DesignCard key={summary.id} summary={summary} menuOpen={menuFor === summary.id} onMenuToggle={toggleMenu} {...cardActions} />
            ))}
          </div>
        </main>
      )}

      {deleting && (
        <DeleteDesignDialog
          summary={deleting}
          onCancel={() => setDeleting(null)}
          onExport={() => void exportDesign(deleting.id)}
          onConfirm={() => void onConfirmDelete()}
        />
      )}
    </div>
  )
}
