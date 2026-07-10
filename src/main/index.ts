import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const IPC_WORKER_EVENT = 'tgwr:worker-event' as const
const IPC_WORKER_PING = 'tgwr:worker-ping' as const
const IPC_WORKER_IMPORT = 'tgwr:worker-import' as const
const IPC_WORKER_BUILD_REPORT = 'tgwr:worker-build-report' as const
const IPC_WORKER_CANCEL = 'tgwr:worker-cancel' as const
const IPC_PICK_EXPORT_DIR = 'tgwr:pick-export-dir' as const
const IPC_PICK_OUTPUT_DIR = 'tgwr:pick-output-dir' as const
const IPC_WRITE_OUTPUT_FILE = 'tgwr:write-output-file' as const
const IPC_LOAD_REPORT = 'tgwr:load-report' as const
const IPC_RESET_REPORT = 'tgwr:reset-report' as const
const IPC_DELETE_ALL_DATA = 'tgwr:delete-all-data' as const

if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

interface WorkerStatusEvent {
  type: 'worker_status'
  status: 'ok' | 'fail'
  message: string
  ts: string
}

interface WorkerHostEvent {
  type: 'worker_host_event'
  level: 'info' | 'error'
  message: string
  ts: string
  details?: JsonObject
}

let mainWindow: BrowserWindow | null = null

let workerProc: ChildProcessWithoutNullStreams | null = null
let workerStdoutBuffer = ''
let workerCommandUsed: string | null = null
const selectedExportDirs = new Set<string>()
const outputDirectoryGrants = new Map<string, string>()

let pendingEvents: unknown[] = []
let lastKnownStatus: WorkerStatusEvent = {
  type: 'worker_status',
  status: 'fail',
  message: 'Worker not started',
  ts: new Date().toISOString()
}

function nowIso(): string {
  return new Date().toISOString()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canSendToRenderer(): boolean {
  if (!mainWindow) return false
  if (mainWindow.isDestroyed()) return false
  const wc = mainWindow.webContents
  if (wc.isDestroyed()) return false
  return wc.getURL().length > 0 && !wc.isLoading()
}

function emitToRenderer(payload: unknown): void {
  if (canSendToRenderer() && mainWindow) {
    mainWindow.webContents.send(IPC_WORKER_EVENT, payload)
    return
  }
  pendingEvents.push(payload)
}

function flushPendingEvents(): void {
  if (!canSendToRenderer() || !mainWindow) return
  const wc = mainWindow.webContents
  const toFlush = pendingEvents
  pendingEvents = []
  for (const ev of toFlush) {
    wc.send(IPC_WORKER_EVENT, ev)
  }
}

function emitStatus(status: 'ok' | 'fail', message: string): void {
  const ev: WorkerStatusEvent = { type: 'worker_status', status, message, ts: nowIso() }
  lastKnownStatus = ev
  emitToRenderer(ev)
}

function emitHost(level: 'info' | 'error', message: string, details?: JsonObject): void {
  const ev: WorkerHostEvent = {
    type: 'worker_host_event',
    level,
    message,
    ts: nowIso(),
    ...(details ? { details } : {})
  }
  emitToRenderer(ev)
}

function openExternalIfAllowed(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    void shell.openExternal(url.toString())
    return true
  } catch {
    return false
  }
}

function sendToWorker(cmdObj: unknown): void {
  if (!workerProc || workerProc.stdin.destroyed) {
    emitStatus('fail', 'Worker not running')
    emitToRenderer({
      type: 'worker_send_fail',
      message: 'Worker not running',
      ts: nowIso(),
      cmd: isPlainObject(cmdObj) ? (cmdObj as JsonObject) : { valueType: typeof cmdObj }
    })
    return
  }

  let line: string
  try {
    line = JSON.stringify(cmdObj)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emitToRenderer({
      type: 'worker_send_fail',
      message: 'Failed to serialize command',
      ts: nowIso(),
      error: msg
    })
    return
  }

  try {
    workerProc.stdin.write(`${line}\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emitStatus('fail', `Failed to write to worker stdin: ${msg}`)
  }
}

function handleWorkerStdoutChunk(text: string): void {
  workerStdoutBuffer += text

  while (true) {
    const nl = workerStdoutBuffer.indexOf('\n')
    if (nl === -1) break

    const rawLine = workerStdoutBuffer.slice(0, nl)
    workerStdoutBuffer = workerStdoutBuffer.slice(nl + 1)

    const line = rawLine.trim().replace(/\r$/, '')
    if (!line) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitToRenderer({
        type: 'worker_parse_error',
        message: msg,
        ts: nowIso(),
        line
      })
      continue
    }

    emitToRenderer(parsed)
  }
}

function attachWorker(proc: ChildProcessWithoutNullStreams): void {
  workerStdoutBuffer = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    handleWorkerStdoutChunk(chunk.toString('utf8'))
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    const lines = text.split(/\r?\n/)
    for (const ln of lines) {
      const t = ln.trim()
      if (!t) continue
      emitToRenderer({
        type: 'worker_stderr',
        ts: nowIso(),
        text: t
      })
    }
  })

  proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    workerProc = null
    workerCommandUsed = null
    emitStatus('fail', `Worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
  })

  proc.on('error', (err: Error) => {
    emitStatus('fail', `Worker process error: ${err.message}`)
  })
}

function startWorker(): void {
  if (workerProc) return

  const scriptPath = app.isPackaged
  ? join(process.resourcesPath, 'worker', 'tgwr_worker.py')
  : join(process.cwd(), 'worker', 'tgwr_worker.py')


  const mkArgs = (cmd: string): string[] => {
    if (process.platform === 'win32' && cmd === 'py') return ['-3', '-u', scriptPath]
    return ['-u', scriptPath]
  }

  const candidates: string[] = process.platform === 'win32' ? ['py', 'python'] : ['python', 'python3']

  const tried: string[] = []

  const trySpawn = (idx: number): void => {
    if (idx >= candidates.length) {
      emitStatus(
        'fail',
        `Python not found (tried: ${tried.join(', ')}). Install Python 3 and ensure it is on PATH.`
      )
      return
    }

    const cmd = candidates[idx]
    tried.push(cmd)

    const proc = spawn(cmd, mkArgs(cmd), {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const onError = (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        proc.removeAllListeners()
        trySpawn(idx + 1)
        return
      }

      emitStatus('fail', `Failed to start worker via "${cmd}": ${err.message}`)
      emitHost('error', 'Worker spawn error', {
        cmd,
        message: err.message
      })
    }

    proc.once('error', onError)

    proc.once('spawn', () => {
      proc.removeListener('error', onError)

      workerProc = proc
      workerCommandUsed = cmd

      attachWorker(proc)

      emitStatus('ok', `Worker started (${cmd})`)
      emitHost('info', 'Worker connected', {
        cmd: workerCommandUsed ?? cmd,
        scriptPath
      })

      sendToWorker({ cmd: 'ping' })
    })
  }

  emitHost('info', 'Starting worker…', { script: scriptPath })
  trySpawn(0)
}

function createWindow(): void {
  const preloadCandidates = [
    join(process.cwd(), 'dist', 'preload', 'index.mjs'),
    join(process.cwd(), 'dist', 'preload', 'index.js'),
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]

  const preloadPath = preloadCandidates.find((p) => existsSync(p))

  const win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: true,
    backgroundColor: '#05070a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.setMenuBarVisibility(false)
  mainWindow = win

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win.webContents.getURL()
    if (url === currentUrl) return

    try {
      if (currentUrl && new URL(url).origin === new URL(currentUrl).origin) return
    } catch {
      //
    }

    event.preventDefault()
    openExternalIfAllowed(url)
  })

  win.webContents.on('did-finish-load', () => {
    flushPendingEvents()
    emitToRenderer(lastKnownStatus)
  })

  const devUrl =
    (typeof process.env.VITE_DEV_SERVER_URL === 'string' && process.env.VITE_DEV_SERVER_URL.length > 0
      ? process.env.VITE_DEV_SERVER_URL
      : undefined) ??
    (typeof process.env.ELECTRON_RENDERER_URL === 'string' && process.env.ELECTRON_RENDERER_URL.length > 0
      ? process.env.ELECTRON_RENDERER_URL
      : undefined)

  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

async function computeDbPath(): Promise<{ db_path: string; location: 'userData' }> {
  const userDataDir = app.getPath('userData')
  await fsp.mkdir(userDataDir, { recursive: true })
  return { db_path: join(userDataDir, 'tgwr.db'), location: 'userData' }
}

function dataFilesForDb(dbPath: string): string[] {
  const baseDir = dirname(dbPath)
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, join(baseDir, 'report.json')]
}

function legacyDbPath(): string | null {
  if (!app.isPackaged) return null
  const candidate = join(dirname(process.execPath), 'tgwr.db')
  const canonical = join(app.getPath('userData'), 'tgwr.db')
  return resolve(candidate) === resolve(canonical) ? null : candidate
}

async function migrateLegacyDataIfNeeded(): Promise<void> {
  const legacy = legacyDbPath()
  if (!legacy) return

  const { db_path: canonical } = await computeDbPath()
  const sourceFiles = dataFilesForDb(legacy)
  const targetFiles = dataFilesForDb(canonical)

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const source = sourceFiles[index]
    const target = targetFiles[index]
    if (!existsSync(source) || existsSync(target)) continue
    try {
      await fsp.copyFile(source, target)
    } catch (err) {
      emitHost('error', 'Не удалось перенести старые локальные данные', {
        file: basename(source),
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}

function isSafeFilename(name: string): boolean {
  if (name.trim().length === 0) return false
  if (name !== basename(name)) return false
  if (name.includes('..')) return false
  if (name.includes('/') || name.includes('\\')) return false
  return true
}

function isAllowedOutputFilename(name: string): boolean {
  if (!isSafeFilename(name)) return false
  const ext = extname(name).toLowerCase()
  return ext === '.png' || ext === '.pdf'
}

function isPathInsideDir(parentDir: string, childPath: string): boolean {
  const parent = resolve(parentDir)
  const child = resolve(childPath)
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
}

ipcMain.handle(IPC_PICK_EXPORT_DIR, async () => {
  const parent = mainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined
  const options: OpenDialogOptions = {
    title: 'Select Telegram Desktop Export folder',
    properties: ['openDirectory', 'dontAddToRecent'],
    buttonLabel: 'Select folder'
  }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (res.canceled) return null
  const selected = res.filePaths[0]
  if (!selected) return null
  const normalized = resolve(selected)
  selectedExportDirs.add(normalized)
  return normalized
})

ipcMain.handle(IPC_PICK_OUTPUT_DIR, async () => {
  const parent = mainWindow ?? BrowserWindow.getFocusedWindow() ?? undefined
  const options: OpenDialogOptions = {
    title: 'Select folder to export TGWR slides',
    properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
    buttonLabel: 'Select folder'
  }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (res.canceled) return null
  const selected = res.filePaths[0]
  if (!selected) return null
  const normalized = resolve(selected)
  const token = randomUUID()
  outputDirectoryGrants.set(token, normalized)
  return { token, display_path: normalized }
})

ipcMain.handle(IPC_WRITE_OUTPUT_FILE, async (_event, payload: unknown) => {
  try {
    if (!isPlainObject(payload)) {
      return { ok: false, error: 'Invalid payload (expected object)' }
    }

    const directoryToken = typeof payload.directory_token === 'string' ? payload.directory_token : ''
    const filename = typeof payload.filename === 'string' ? payload.filename : ''
    const bytesAny = payload.bytes as unknown

    const dirPath = outputDirectoryGrants.get(directoryToken)
    if (!dirPath) return { ok: false, error: 'Папка экспорта не была выбрана в текущем сеансе' }
    if (!isAllowedOutputFilename(filename)) return { ok: false, error: 'Unsafe filename or unsupported extension' }

    let bytes: Uint8Array
    try {
      if (Buffer.isBuffer(bytesAny)) {
        bytes = bytesAny
      } else if (bytesAny instanceof Uint8Array) {
        bytes = bytesAny
      } else if (bytesAny instanceof ArrayBuffer) {
        bytes = new Uint8Array(bytesAny)
      } else if (ArrayBuffer.isView(bytesAny)) {
        bytes = new Uint8Array(bytesAny.buffer, bytesAny.byteOffset, bytesAny.byteLength)
      } else if (Array.isArray(bytesAny)) {
        bytes = Buffer.from(bytesAny)
      } else if (typeof bytesAny === 'object' && bytesAny !== null) {
        if ('length' in (bytesAny as any)) {
          bytes = Buffer.from(bytesAny as any)
        } else {
          bytes = Buffer.from(Object.values(bytesAny) as number[])
        }
      } else {
        return { ok: false, error: 'bytes must be Uint8Array/ArrayBuffer, got ' + typeof bytesAny }
      }
    } catch (e) {
      return { ok: false, error: 'Failed to parse bytes: ' + String(e) }
    }

    await fsp.mkdir(dirPath, { recursive: true })
    const outPath = resolve(dirPath, filename)
    if (!isPathInsideDir(dirPath, outPath)) {
      return { ok: false, error: 'Output path escaped selected directory' }
    }
    await fsp.writeFile(outPath, Buffer.from(bytes))
    return { ok: true, path: outPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC_LOAD_REPORT, async () => {
  try {
    const { db_path } = await computeDbPath()
    const report_path = join(dirname(db_path), 'report.json')

    if (!existsSync(report_path)) {
      return { ok: false, db_path, report_path, error: `report.json not found at: ${report_path}` }
    }

    const txt = await fsp.readFile(report_path, { encoding: 'utf8' })
    const report = JSON.parse(txt) as unknown
    return { ok: true, db_path, report_path, report }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC_RESET_REPORT, async () => {
  try {
    const { db_path } = await computeDbPath()
    const report_path = join(dirname(db_path), 'report.json')
    const existed = existsSync(report_path)
    await fsp.rm(report_path, { force: true })
    return { ok: true, db_path, report_path, deleted: existed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC_DELETE_ALL_DATA, async () => {
  try {
    sendToWorker({ cmd: 'cancel' })
    const { db_path } = await computeDbPath()
    const candidates = new Set(dataFilesForDb(db_path))
    const legacy = legacyDbPath()
    if (legacy) {
      for (const filePath of dataFilesForDb(legacy)) candidates.add(filePath)
    }

    const deleted: string[] = []
    for (const filePath of candidates) {
      if (!existsSync(filePath)) continue
      await fsp.rm(filePath, { force: true })
      deleted.push(filePath)
    }

    return {
      ok: true,
      db_path,
      report_path: join(dirname(db_path), 'report.json'),
      deleted_files: deleted.length
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

async function forwardImportExport(exportDir: unknown): Promise<void> {
  if (typeof exportDir !== 'string' || exportDir.trim().length === 0) {
    emitToRenderer({
      type: 'ipc_invalid_cmd',
      ts: nowIso(),
      message: 'import_export requires export_dir: string'
    })
    return
  }

  const normalizedExportDir = resolve(exportDir)
  if (!selectedExportDirs.has(normalizedExportDir)) {
    emitToRenderer({
      type: 'ipc_invalid_cmd',
      ts: nowIso(),
      message: 'Папка Telegram Export не была выбрана в текущем сеансе'
    })
    return
  }

  const { db_path, location } = await computeDbPath()
  emitHost('info', 'DB path selected', { db_path, location })

  sendToWorker({
    cmd: 'import_export',
    mode: 'desktop',
    export_dir: normalizedExportDir,
    db_path
  })
}

ipcMain.on(IPC_WORKER_PING, () => {
  sendToWorker({ cmd: 'ping' })
})

ipcMain.on(IPC_WORKER_CANCEL, () => {
  sendToWorker({ cmd: 'cancel' })
})

ipcMain.on(IPC_WORKER_IMPORT, (_event, exportDir: unknown) => {
  void forwardImportExport(exportDir)
})

ipcMain.on(IPC_WORKER_BUILD_REPORT, (_event, year: unknown) => {
  if (year !== undefined && (!Number.isInteger(year) || Number(year) < 2000 || Number(year) > 2200)) {
    emitToRenderer({
      type: 'ipc_invalid_cmd',
      ts: nowIso(),
      message: 'Год отчёта должен быть целым числом'
    })
    return
  }

  void computeDbPath().then(({ db_path }) => {
    sendToWorker({ cmd: 'build_report', db_path, ...(year === undefined ? {} : { year: Number(year) }) })
  })
})

app.on('before-quit', () => {
  if (workerProc && !workerProc.killed) {
    try {
      workerProc.kill()
    } catch {
      //
    }
  }
})

app.whenReady().then(async () => {
  await migrateLegacyDataIfNeeded()
  createWindow()
  startWorker()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      startWorker()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
