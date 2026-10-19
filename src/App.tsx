import { useEffect, useState } from 'react'
import { DesignManager } from './components/DesignManager'
import { Editor } from './components/Editor'
import { ToastHost } from './components/ToastHost'
import { autosave } from './storage/autosave'
import { getDesign } from './storage/designDb'
import { useAppStore } from './store/appStore'
import { useHistoryShortcuts } from './store/historyShortcuts'
import { useSettingsStore } from './store/settingsStore'
import './App.css'

// The open design lives in the URL hash, so a refresh reopens it.
const DESIGN_HASH = '#/mansion/'
const designIdFromHash = (): string | null =>
  location.hash.startsWith(DESIGN_HASH) ? decodeURIComponent(location.hash.slice(DESIGN_HASH.length)) : null
const openDesign = (id: string) => (location.hash = DESIGN_HASH + encodeURIComponent(id))
const leaveDesign = () => (location.hash = '')

function App() {
  useHistoryShortcuts()
  const [screen, setScreen] = useState<'loading' | 'start' | 'editor'>('loading')
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  useEffect(() => void useSettingsStore.getState().load(), [])

  useEffect(() => {
    let openId: string | null = null
    let cancelled = false

    async function sync() {
      const id = designIdFromHash()
      if (openId && id === openId) return
      if (openId) {
        // Leaving the editor: keep it open if the last save fails, so nothing is lost.
        if (!(await autosave.close())) return void openDesign(openId)
        openId = null
      }
      if (!id) return setScreen('start')
      const design = await getDesign(id)
      if (cancelled) return
      if (!design) {
        useAppStore.getState().showToast("That mansion couldn't be found")
        history.replaceState(null, '', location.pathname)
        return setScreen('start')
      }
      autosave.open(design)
      openId = id
      setScreen('editor')
    }

    void sync()
    window.addEventListener('hashchange', sync)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  // Save straight away when the tab is hidden or closed rather than waiting for the debounce.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosave.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  return (
    <div className="app">
      {screen === 'start' && <DesignManager onOpen={openDesign} />}
      {screen === 'editor' && settingsLoaded && <Editor onBack={leaveDesign} />}
      <ToastHost />
    </div>
  )
}

export default App
