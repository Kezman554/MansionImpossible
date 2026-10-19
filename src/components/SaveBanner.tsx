import { downloadDesign } from '../storage/designFile'
import { useAppStore } from '../store/appStore'
import { WarningIcon } from './icons'

/** Persistent banner while a save is failing. Goes away only when a save succeeds. */
export function SaveBanner() {
  const problem = useAppStore((s) => s.saveProblem)
  if (!problem) return null
  const { design } = problem

  return (
    <div role="alert" className="save-banner">
      <WarningIcon size={22} className="save-banner__icon" />
      <div className="save-banner__text">
        <div className="save-banner__title">{problem.message}</div>
        <div className="save-banner__detail">
          {design ? 'Your changes are still open. Export a copy now, then free some space.' : 'Nothing was changed. Free some space, then try again.'}
        </div>
      </div>
      {design && (
        <button type="button" className="btn btn--small btn--primary" onClick={() => downloadDesign(design)}>
          Export JSON
        </button>
      )}
      <button type="button" className="btn btn--small btn--on-raised" onClick={problem.retry}>
        Try again
      </button>
    </div>
  )
}
