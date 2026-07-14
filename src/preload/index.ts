import { contextBridge, ipcRenderer } from 'electron'

const IPC_WORKER_EVENT = 'tgwr:worker-event' as const
const IPC_WORKER_PING = 'tgwr:worker-ping' as const
const IPC_WORKER_IMPORT = 'tgwr:worker-import' as const
const IPC_WORKER_BUILD_REPORT = 'tgwr:worker-build-report' as const
const IPC_WORKER_PRELOAD_REPORTS = 'tgwr:worker-preload-reports' as const
const IPC_WORKER_CANCEL = 'tgwr:worker-cancel' as const
const IPC_WORKER_RESTART = 'tgwr:worker-restart' as const
const IPC_PICK_EXPORT_DIR = 'tgwr:pick-export-dir' as const
const IPC_PICK_OUTPUT_DIR = 'tgwr:pick-output-dir' as const
const IPC_WRITE_OUTPUT_FILE = 'tgwr:write-output-file' as const
const IPC_LOAD_REPORT = 'tgwr:load-report' as const
const IPC_RESET_REPORT = 'tgwr:reset-report' as const
const IPC_DELETE_ALL_DATA = 'tgwr:delete-all-data' as const
const IPC_RENDERER_READY = 'tgwr:renderer-ready' as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type LoadReportResult =
  | {
      ok: true
      db_path: string
      report_path: string
      report: unknown
      cached_years: number[]
      report_stale: boolean
    }
  | {
      ok: false
      db_path?: string
      report_path?: string
      db_exists?: boolean
      report_exists?: boolean
      local_data_exists?: boolean
      error?: string
    }

export type OutputDirectoryGrant = {
  token: string
  displayPath: string
}

export type WriteOutputFileResult =
  | {
      ok: true
      path: string
    }
  | {
      ok: false
      error?: string
    }

export type DataMutationResult =
  | {
      ok: true
      db_path: string
      report_path: string
      deleted?: boolean
      deleted_files?: number
    }
  | {
      ok: false
      error?: string
    }

export interface TgwrApi {
  rendererReady: () => void
  onWorkerEvent: (cb: (payload: unknown) => void) => () => void
  pingWorker: () => void
  importExport: (exportDir: string) => void
  buildReport: (year?: number) => void
  preloadReports: (years: number[]) => void
  cancelWorker: () => void
  restartWorker: () => void

  pickExportDir: () => Promise<string | null>
  pickOutputDir: () => Promise<OutputDirectoryGrant | null>
  writeOutputFile: (directoryToken: string, filename: string, bytes: Uint8Array) => Promise<WriteOutputFileResult>

  loadReport: () => Promise<LoadReportResult>
  resetReport: () => Promise<DataMutationResult>
  deleteAllData: () => Promise<DataMutationResult>
}

function normalizeDataMutationResult(value: unknown): DataMutationResult {
  if (isPlainObject(value) && typeof value.ok === 'boolean') return value as DataMutationResult
  return { ok: false, error: 'Приложение вернуло некорректный ответ' }
}

const api: TgwrApi = {
  rendererReady: () => ipcRenderer.send(IPC_RENDERER_READY),

  onWorkerEvent: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(IPC_WORKER_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_WORKER_EVENT, listener)
  },

  pingWorker: () => ipcRenderer.send(IPC_WORKER_PING),
  importExport: (exportDir) => ipcRenderer.send(IPC_WORKER_IMPORT, exportDir),
  buildReport: (year) => ipcRenderer.send(IPC_WORKER_BUILD_REPORT, year),
  preloadReports: (years) => ipcRenderer.send(IPC_WORKER_PRELOAD_REPORTS, years),
  cancelWorker: () => ipcRenderer.send(IPC_WORKER_CANCEL),
  restartWorker: () => ipcRenderer.send(IPC_WORKER_RESTART),

  pickExportDir: async () => {
    const res = await ipcRenderer.invoke(IPC_PICK_EXPORT_DIR)
    return typeof res === 'string' ? res : null
  },

  pickOutputDir: async () => {
    const res = await ipcRenderer.invoke(IPC_PICK_OUTPUT_DIR)
    if (!isPlainObject(res) || typeof res.token !== 'string' || typeof res.display_path !== 'string') return null
    return { token: res.token, displayPath: res.display_path }
  },

  writeOutputFile: async (directoryToken, filename, bytes) => {
    const res = await ipcRenderer.invoke(IPC_WRITE_OUTPUT_FILE, {
      directory_token: directoryToken,
      filename,
      bytes
    })

    if (isPlainObject(res) && typeof res.ok === 'boolean') {
      if (res.ok) {
        return { ok: true, path: typeof res.path === 'string' ? res.path : '' }
      }
      return { ok: false, error: typeof res.error === 'string' ? res.error : 'Неизвестная ошибка сохранения' }
    }
    return { ok: false, error: 'Приложение вернуло некорректный ответ' }
  },

  loadReport: async () => {
    const res = await ipcRenderer.invoke(IPC_LOAD_REPORT)
    if (isPlainObject(res) && typeof res.ok === 'boolean') return res as LoadReportResult
    return { ok: false, error: 'Приложение вернуло некорректный ответ' }
  },

  resetReport: async () => normalizeDataMutationResult(await ipcRenderer.invoke(IPC_RESET_REPORT)),
  deleteAllData: async () => normalizeDataMutationResult(await ipcRenderer.invoke(IPC_DELETE_ALL_DATA))
}

contextBridge.exposeInMainWorld('tgwr', api)
