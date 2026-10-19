import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppStore } from './store/appStore'
import { useDesignStore } from './store/designStore'
import { useEditorStore } from './store/editorStore'

// Dev only: lets the console (and browser tests) drive the stores before editing tools exist.
if (import.meta.env.DEV) Object.assign(window, { __mansion: { useDesignStore, useAppStore, useEditorStore } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
