import { useAppStore } from '../store/appStore'
import { TickIcon } from './icons'

/** The current toast, bottom centre. The live region stays mounted so screen readers announce each one. */
export function ToastHost() {
  const toast = useAppStore((s) => s.toast)
  return (
    <div role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className="toast">
          {toast.tone === 'saved' && <TickIcon size={18} className="toast__tick" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
