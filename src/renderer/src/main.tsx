import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

declare global {
  interface Window {
    tgwr: {
      onWorkerEvent: (cb: (payload: unknown) => void) => () => void
      sendWorker: (cmdObj: Record<string, unknown>) => void
      pickExportDir: () => Promise<string | null>
      loadReport: (dbPath?: string) => Promise<
        | { ok: true; db_path: string; report_path: string; report: unknown }
        | { ok: false; db_path: string; report_path: string; error: string }
      >
    }
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
