import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { QUALITY_SEGMENTS } from './qualitySegments'
import { CloseIcon } from './icons'
import { SegmentedControl } from './SegmentedControl'

interface SettingsDialogProps {
  onClose: () => void
}

/** App settings: they apply to every mansion on this computer. */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { quality, showFps, update } = useSettingsStore()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="settings-title"
      className="settings-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="settings-dialog__head">
        <h2 id="settings-title" className="settings-dialog__title">
          Settings
        </h2>
        <button type="button" className="icon-btn icon-btn--raised" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="settings-dialog__row">
        <div>
          <div className="settings-dialog__label">Quality</div>
          <div className="settings-dialog__detail">Resolution, shadows and edge smoothing</div>
        </div>
        <SegmentedControl label="Quality" segments={QUALITY_SEGMENTS} value={quality} onChange={(q) => update({ quality: q })} />
      </div>
      <label className="settings-dialog__row">
        <span className="settings-dialog__label">Show frame rate</span>
        <input type="checkbox" className="settings-dialog__check" checked={showFps} onChange={(e) => update({ showFps: e.target.checked })} />
      </label>
    </dialog>
  )
}
