import { useEffect, useRef } from 'react'
import type { DesignSummary } from '../storage/designDb'
import { BinIcon } from './icons'

interface DeleteDesignDialogProps {
  summary: DesignSummary
  onCancel: () => void
  onExport: () => void
  onConfirm: () => void
}

/** The only delete in the app that asks first: a whole mansion can't be undone. */
export function DeleteDesignDialog({ summary, onCancel, onExport, onConfirm }: DeleteDesignDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="delete-design-title"
      aria-describedby="delete-design-body"
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      <h2 id="delete-design-title" className="confirm-dialog__title">
        Delete {summary.name}?
      </h2>
      <p id="delete-design-body" className="confirm-dialog__body">
        This removes the design from this browser. It can't be undone — export a copy first if you might want it back.
      </p>
      <div className="confirm-dialog__actions">
        <button type="button" className="btn" autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={onExport}>
          Export first
        </button>
        <button type="button" className="btn btn--danger confirm-dialog__confirm" onClick={onConfirm}>
          <BinIcon size={14} />
          Delete mansion
        </button>
      </div>
    </dialog>
  )
}
