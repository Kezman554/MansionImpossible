import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DesignSummary } from '../storage/designDb'
import { formatEdited, plural } from './formatEdited'
import { BinIcon, MoreIcon } from './icons'

export interface DesignCardActions {
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string) => void
  onDelete: (summary: DesignSummary) => void
}

interface DesignCardProps extends DesignCardActions {
  summary: DesignSummary
  menuOpen: boolean
  /** Stable across renders (the menu effect depends on it). */
  onMenuToggle: (id: string, open: boolean) => void
}

export function DesignCard({ summary, menuOpen, onMenuToggle, onOpen, onRename, onDuplicate, onExport, onDelete }: DesignCardProps) {
  const [renaming, setRenaming] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // Focus the first item when the menu opens; close on outside click.
  useEffect(() => {
    if (!menuOpen) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !menuButton.current?.contains(target)) onMenuToggle(summary.id, false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen, onMenuToggle, summary.id])

  const choose = (action: () => void) => () => {
    onMenuToggle(summary.id, false)
    action()
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      onMenuToggle(summary.id, false)
      menuButton.current?.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    }
  }

  const meta = `${formatEdited(summary.updatedAt)} · ${plural(summary.floorCount, 'floor')} · ${plural(summary.roomCount, 'room')}`

  return (
    <article className="design-card">
      <button type="button" className="design-card__preview" aria-label={`Open ${summary.name}`} onClick={() => onOpen(summary.id)}>
        <svg className="design-card__glyph" viewBox="0 0 80 100" aria-hidden="true">
          <path d="M20 14 V80 A20 8 0 0 0 60 80 V14" />
          <ellipse cx="40" cy="14" rx="20" ry="8" />
          <path className="design-card__water" d="M20 58 C 28 62, 34 54, 40 58 S 52 62, 60 58 V80 A20 8 0 0 1 20 80 Z" />
        </svg>
      </button>
      <div className="design-card__info">
        <div className="design-card__text">
          {renaming ? (
            <RenameField
              name={summary.name}
              onDone={(name) => {
                setRenaming(false)
                if (name && name !== summary.name) onRename(summary.id, name)
              }}
            />
          ) : (
            <div className="design-card__name">{summary.name}</div>
          )}
          <div className="design-card__meta">{meta}</div>
        </div>
        <button
          ref={menuButton}
          type="button"
          className="icon-btn"
          aria-label={`More actions for ${summary.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => onMenuToggle(summary.id, !menuOpen)}
        >
          <MoreIcon size={18} />
        </button>
      </div>
      {menuOpen && (
        <div ref={menu} role="menu" aria-label={`Actions for ${summary.name}`} className="menu design-card__menu" onKeyDown={onMenuKeyDown}>
          <button role="menuitem" type="button" className="menu__item" onClick={choose(() => onOpen(summary.id))}>
            Open
          </button>
          <button role="menuitem" type="button" className="menu__item" onClick={choose(() => setRenaming(true))}>
            Rename
          </button>
          <button role="menuitem" type="button" className="menu__item" onClick={choose(() => onDuplicate(summary.id))}>
            Duplicate
          </button>
          <button role="menuitem" type="button" className="menu__item" onClick={choose(() => onExport(summary.id))}>
            Export as JSON
          </button>
          <div role="separator" className="menu__divider" />
          <button role="menuitem" type="button" className="menu__item menu__item--danger" onClick={choose(() => onDelete(summary))}>
            <BinIcon size={14} />
            Delete mansion…
          </button>
        </div>
      )}
    </article>
  )
}

/** Inline name editor: Enter or blur saves, Escape cancels. */
function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (result: string | null) => {
    if (done.current) return
    done.current = true
    onDone(result)
  }

  return (
    <input
      className="design-card__rename"
      aria-label="Mansion name"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value.trim() || null)
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}
