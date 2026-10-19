import { Canvas } from '@react-three/fiber'
import { overlayTokens } from '../scene/overlayTokens'
import { useAppStore } from '../store/appStore'
import { useDesignStore } from '../store/designStore'
import { BackIcon } from './icons'
import { SaveBanner } from './SaveBanner'
import './Editor.css'

interface EditorProps {
  onBack: () => void
}

/** The open design: top bar, save banner (when failing) and the 3D viewport. */
export function Editor({ onBack }: EditorProps) {
  const name = useDesignStore((s) => s.design.name)
  const unsaved = useAppStore((s) => s.saveProblem !== null)

  return (
    <div className="editor">
      <header className="editor__bar">
        <button type="button" className="btn btn--small" onClick={onBack}>
          <BackIcon size={14} />
          My mansions
        </button>
        <span className="editor__name">{name}</span>
        {unsaved && <span className="editor__unsaved">· not saved</span>}
      </header>
      <SaveBanner />
      <div className="editor__viewport">
        <Canvas camera={{ position: [12, 9, 12], fov: 45 }}>
          <color attach="background" args={[overlayTokens.ground]} />
        </Canvas>
      </div>
    </div>
  )
}
