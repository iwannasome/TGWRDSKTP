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

const REPORT_CACHE_REVISION = 2
const REPORT_CACHE_DIR_NAME = 'report-cache'
const PACKAGED_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

const singleInstanceLockAcquired = app.requestSingleInstanceLock()
if (!singleInstanceLockAcquired) app.quit()

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
  message: 'Модуль анализа запускается',
  ts: new Date().toISOString()
}
let smokeWorkerPong = false
let smokeRendererReady = false
let smokeExitScheduled = false
let smokeRestartStarted = false
let smokePackagedCspApplied = false
let workerRestartPromise: Promise<void> | null = null
let dataDeletionRunning = false

if (singleInstanceLockAcquired) {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })
}

function nowIso(): string {
  return new Date().toISOString()
}

function finishPackagedSmokeWhenReady(): void {
  const singleInstancePrimarySmoke = process.env.TGWR_SMOKE_SINGLE_INSTANCE_PRIMARY === '1'
  if (process.env.TGWR_SMOKE_EXIT_ON_PONG !== '1' && !singleInstancePrimarySmoke) return
  if (!smokeWorkerPong || !smokeRendererReady || !smokePackagedCspApplied || smokeExitScheduled) return

  if (singleInstancePrimarySmoke) {
    smokeExitScheduled = true
    console.log('tgwr_single_instance_primary=ready')
    return
  }

  if (process.env.TGWR_SMOKE_RESTART_WORKER === '1' && !smokeRestartStarted) {
    smokeRestartStarted = true
    smokeWorkerPong = false
    void restartWorkerProcess()
    return
  }

  smokeExitScheduled = true
  const workerState = smokeRestartStarted ? 'restart_pong' : 'pong'
  console.log(`tgwr_packaged_app_smoke=ok worker=${workerState} renderer=ready`)
  setTimeout(() => app.quit(), 50)
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
    emitStatus('fail', 'Модуль анализа не запущен')
    emitToRenderer({
      type: 'worker_send_fail',
      message: 'Модуль анализа не запущен',
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
      message: 'Не удалось подготовить команду для модуля анализа',
      ts: nowIso(),
      error: msg
    })
    return
  }

  try {
    workerProc.stdin.write(`${line}\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emitStatus('fail', `Не удалось передать команду модулю анализа: ${msg}`)
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
    if (isPlainObject(parsed) && parsed.type === 'pong') {
      smokeWorkerPong = true
      finishPackagedSmokeWhenReady()
    }
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
    emitStatus('fail', `Модуль анализа завершил работу (код ${code ?? '—'}, сигнал ${signal ?? '—'})`)
  })

  proc.on('error', (err: Error) => {
    emitStatus('fail', `Ошибка процесса анализа: ${err.message}`)
  })
}

async function waitForWorkerExit(proc: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  return await new Promise((resolvePromise) => {
    let settled = false
    const onClose = () => finish(true)
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      proc.removeListener('close', onClose)
      resolvePromise(value)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    proc.once('close', onClose)
  })
}

async function stopWorkerProcess(): Promise<void> {
  const proc = workerProc
  if (!proc) return

  const gracefulExit = waitForWorkerExit(proc, 2_000)
  try {
    proc.kill()
  } catch {
    // The process may already be terminating; the close wait below remains authoritative.
  }
  if (await gracefulExit) return

  const forcedExit = waitForWorkerExit(proc, 2_000)
  try {
    proc.kill('SIGKILL')
  } catch {
    // The second wait reports a deterministic error if the process cannot be stopped.
  }
  if (!(await forcedExit)) throw new Error('Не удалось остановить модуль анализа')
}

async function restartWorkerProcess(): Promise<void> {
  if (workerRestartPromise) return await workerRestartPromise

  workerRestartPromise = (async () => {
    emitStatus('fail', 'Перезапускаю модуль анализа…')
    try {
      await stopWorkerProcess()
      startWorker()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitStatus('fail', message)
    }
  })()

  try {
    await workerRestartPromise
  } finally {
    workerRestartPromise = null
  }
}

function startWorker(): void {
  if (workerProc) return

  type LaunchCandidate = {
    command: string
    args: string[]
    label: string
    cwd: string
  }

  const candidates: LaunchCandidate[] = []
  let diagnosticPath = ''

  if (app.isPackaged) {
    const executableName = process.platform === 'win32' ? 'tgwr-worker.exe' : 'tgwr-worker'
    const bundledPath = join(process.resourcesPath, 'worker-bin', `${process.platform}-${process.arch}`, executableName)
    diagnosticPath = bundledPath
    if (!existsSync(bundledPath)) {
      emitStatus('fail', `В установленном приложении отсутствует встроенный worker: ${executableName}`)
      emitHost('error', 'Bundled worker is missing', { platform: process.platform, arch: process.arch })
      return
    }
    candidates.push({ command: bundledPath, args: [], label: 'bundled', cwd: dirname(bundledPath) })
  } else {
    const scriptPath = join(process.cwd(), 'worker', 'tgwr_worker.py')
    diagnosticPath = scriptPath
    const localPython = process.platform === 'win32'
      ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : join(process.cwd(), '.venv', 'bin', 'python')
    if (existsSync(localPython)) {
      candidates.push({ command: localPython, args: ['-u', scriptPath], label: '.venv', cwd: process.cwd() })
    }
    const pythonCommands = process.platform === 'win32' ? ['py', 'python'] : ['python', 'python3']
    for (const command of pythonCommands) {
      const args = process.platform === 'win32' && command === 'py'
        ? ['-3', '-u', scriptPath]
        : ['-u', scriptPath]
      candidates.push({ command, args, label: command, cwd: process.cwd() })
    }
  }

  const tried: string[] = []

  const trySpawn = (idx: number): void => {
    if (idx >= candidates.length) {
      emitStatus(
        'fail',
        app.isPackaged
          ? 'Не удалось запустить встроенный модуль анализа. Переустанови TGWR.'
          : `Python 3 не найден (проверено: ${tried.join(', ')}). Установи Python 3 и перезапусти TGWR.`
      )
      return
    }

    const candidate = candidates[idx]
    tried.push(candidate.label)

    const proc = spawn(candidate.command, candidate.args, {
      cwd: candidate.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const onError = (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        proc.removeAllListeners()
        trySpawn(idx + 1)
        return
      }

      emitStatus('fail', `Не удалось запустить модуль анализа через ${candidate.label}: ${err.message}`)
      emitHost('error', 'Worker spawn error', {
        command: candidate.label,
        message: err.message
      })
    }

    proc.once('error', onError)

    proc.once('spawn', () => {
      proc.removeListener('error', onError)

      workerProc = proc
      workerCommandUsed = candidate.label

      attachWorker(proc)

      emitStatus('ok', app.isPackaged ? 'Встроенный модуль анализа запущен' : `Модуль анализа запущен (${candidate.label})`)
      emitHost('info', 'Worker connected', {
        command: workerCommandUsed ?? candidate.label,
        packaged: app.isPackaged
      })

      sendToWorker({ cmd: 'ping' })
    })
  }

  emitHost('info', 'Starting worker…', { packaged: app.isPackaged, target: basename(diagnosticPath) })
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
  const appIconPath = app.isPackaged
    ? join(process.resourcesPath, 'app-icon.png')
    : join(process.cwd(), 'build', 'icon.png')

  const win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: true,
    backgroundColor: '#05070a',
    icon: existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  })

  win.setMenuBarVisibility(false)
  mainWindow = win

  if (app.isPackaged) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      if (!details.url.startsWith('file:')) {
        callback({ responseHeaders: details.responseHeaders })
        return
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PACKAGED_CONTENT_SECURITY_POLICY]
        }
      })
      if (
        (process.env.TGWR_SMOKE_EXIT_ON_PONG === '1' || process.env.TGWR_SMOKE_SINGLE_INSTANCE_PRIMARY === '1') &&
        !smokePackagedCspApplied
      ) {
        smokePackagedCspApplied = true
        console.log('tgwr_packaged_csp=applied')
        finishPackagedSmokeWhenReady()
      }
    })
  } else {
    smokePackagedCspApplied = true
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
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

function importStagingFilesForDb(dbPath: string): string[] {
  const stagingDbPath = `${dbPath}.importing`
  return [stagingDbPath, `${stagingDbPath}-wal`, `${stagingDbPath}-shm`]
}

function reportCacheRootForDb(dbPath: string): string {
  return join(dirname(dbPath), REPORT_CACHE_DIR_NAME)
}

function reportCacheDirForDb(dbPath: string): string {
  return join(reportCacheRootForDb(dbPath), `v${REPORT_CACHE_REVISION}`)
}

async function listCachedReportYears(dbPath: string): Promise<number[]> {
  try {
    const entries = await fsp.readdir(reportCacheDirForDb(dbPath), { withFileTypes: true })
    return entries
      .flatMap((entry) => {
        if (!entry.isFile()) return []
        const match = /^report-(\d{4})\.json$/.exec(entry.name)
        if (!match) return []
        const year = Number(match[1])
        return Number.isInteger(year) && year >= 2000 && year <= 2200 ? [year] : []
      })
      .sort((a, b) => b - a)
  } catch {
    return []
  }
}

async function clearReportArtifacts(dbPath: string): Promise<boolean> {
  const reportPath = join(dirname(dbPath), 'report.json')
  const cacheRoot = reportCacheRootForDb(dbPath)
  const existed = existsSync(reportPath) || existsSync(cacheRoot)
  await Promise.all([
    fsp.rm(reportPath, { force: true }),
    fsp.rm(cacheRoot, { recursive: true, force: true })
  ])
  return existed
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
    title: 'Выберите папку экспорта Telegram Desktop',
    properties: ['openDirectory', 'dontAddToRecent'],
    buttonLabel: 'Выбрать папку'
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
    title: 'Выберите папку для экспорта слайдов TGWR',
    properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
    buttonLabel: 'Выбрать папку'
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
      return { ok: false, error: 'Некорректные данные для сохранения файла' }
    }

    const directoryToken = typeof payload.directory_token === 'string' ? payload.directory_token : ''
    const filename = typeof payload.filename === 'string' ? payload.filename : ''
    const bytesAny = payload.bytes as unknown

    const dirPath = outputDirectoryGrants.get(directoryToken)
    if (!dirPath) return { ok: false, error: 'Папка экспорта не была выбрана в текущем сеансе' }
    if (!isAllowedOutputFilename(filename)) {
      return { ok: false, error: 'Недопустимое имя файла или формат: разрешены только PNG и PDF' }
    }

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
        return { ok: false, error: `Не удалось подготовить содержимое файла (тип: ${typeof bytesAny})` }
      }
    } catch (e) {
      return { ok: false, error: `Не удалось подготовить содержимое файла: ${String(e)}` }
    }

    await fsp.mkdir(dirPath, { recursive: true })
    const outPath = resolve(dirPath, filename)
    if (!isPathInsideDir(dirPath, outPath)) {
      return { ok: false, error: 'Путь файла вышел за пределы выбранной папки' }
    }

    // Записываем рядом и атомарно заменяем цель: не оставляем частичный файл
    // и заменяем существующий симлинк вместо перехода по нему.
    const tempPath = join(dirPath, `.${filename}.${randomUUID()}.tmp`)
    try {
      await fsp.writeFile(tempPath, Buffer.from(bytes), { flag: 'wx' })
      await fsp.rename(tempPath, outPath)
    } finally {
      await fsp.rm(tempPath, { force: true }).catch(() => undefined)
    }
    return { ok: true, path: outPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC_LOAD_REPORT, async () => {
  let dbPath = ''
  let reportPath = ''
  try {
    const { db_path } = await computeDbPath()
    dbPath = db_path
    reportPath = join(dirname(db_path), 'report.json')
    const db_exists = existsSync(dbPath)
    const report_exists = existsSync(reportPath)
    const local_data_exists = db_exists || report_exists || existsSync(reportCacheRootForDb(dbPath))

    if (!report_exists) {
      return {
        ok: false,
        db_path: dbPath,
        report_path: reportPath,
        db_exists,
        report_exists,
        local_data_exists,
        error: db_exists
          ? 'Локальная база найдена, но сохранённый отчёт отсутствует'
          : 'Сохранённый отчёт не найден'
      }
    }

    const txt = await fsp.readFile(reportPath, { encoding: 'utf8' })
    const report = JSON.parse(txt) as unknown
    const meta = isPlainObject(report) && isPlainObject(report.meta) ? report.meta : {}
    const report_stale = Number(meta.report_cache_revision ?? 0) !== REPORT_CACHE_REVISION
    const cached_years = await listCachedReportYears(dbPath)
    return { ok: true, db_path: dbPath, report_path: reportPath, report, cached_years, report_stale }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      ...(dbPath ? { db_path: dbPath, db_exists: existsSync(dbPath) } : {}),
      ...(reportPath ? { report_path: reportPath, report_exists: existsSync(reportPath) } : {}),
      ...(dbPath
        ? {
            local_data_exists:
              existsSync(dbPath) ||
              (reportPath ? existsSync(reportPath) : false) ||
              existsSync(reportCacheRootForDb(dbPath))
          }
        : {}),
      error: reportPath && existsSync(reportPath)
        ? `Сохранённый отчёт повреждён или не читается: ${msg}`
        : msg
    }
  }
})

ipcMain.handle(IPC_RESET_REPORT, async () => {
  try {
    const { db_path } = await computeDbPath()
    const report_path = join(dirname(db_path), 'report.json')
    const existed = await clearReportArtifacts(db_path)
    return { ok: true, db_path, report_path, deleted: existed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC_DELETE_ALL_DATA, async () => {
  if (dataDeletionRunning) {
    return { ok: false, error: 'Полное удаление данных уже выполняется' }
  }

  dataDeletionRunning = true
  try {
    if (workerRestartPromise) await workerRestartPromise
    await stopWorkerProcess()
    const { db_path } = await computeDbPath()
    const candidates = new Set([...dataFilesForDb(db_path), ...importStagingFilesForDb(db_path)])
    const cacheRoots = new Set([reportCacheRootForDb(db_path)])
    const legacy = legacyDbPath()
    if (legacy) {
      for (const filePath of dataFilesForDb(legacy)) candidates.add(filePath)
      for (const filePath of importStagingFilesForDb(legacy)) candidates.add(filePath)
      cacheRoots.add(reportCacheRootForDb(legacy))
    }

    const deleted: string[] = []
    for (const filePath of candidates) {
      if (!existsSync(filePath)) continue
      await fsp.rm(filePath, { force: true })
      deleted.push(filePath)
    }
    for (const cacheRoot of cacheRoots) {
      if (!existsSync(cacheRoot)) continue
      await fsp.rm(cacheRoot, { recursive: true, force: true })
      deleted.push(cacheRoot)
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
  } finally {
    dataDeletionRunning = false
    startWorker()
  }
})

async function forwardImportExport(exportDir: unknown): Promise<void> {
  if (typeof exportDir !== 'string' || exportDir.trim().length === 0) {
    emitToRenderer({
      type: 'ipc_invalid_cmd',
      ts: nowIso(),
      message: 'Для импорта нужно выбрать папку Telegram Export'
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

ipcMain.on(IPC_RENDERER_READY, () => {
  smokeRendererReady = true
  finishPackagedSmokeWhenReady()
})

ipcMain.on(IPC_WORKER_CANCEL, () => {
  sendToWorker({ cmd: 'cancel' })
})

ipcMain.on(IPC_WORKER_RESTART, () => {
  if (dataDeletionRunning) return
  void restartWorkerProcess()
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

ipcMain.on(IPC_WORKER_PRELOAD_REPORTS, (_event, years: unknown) => {
  if (!Array.isArray(years)) {
    emitToRenderer({
      type: 'ipc_invalid_cmd',
      ts: nowIso(),
      message: 'Список годов для предзагрузки должен быть массивом'
    })
    return
  }

  const normalized = [...new Set(years)]
    .filter((year): year is number => Number.isInteger(year) && Number(year) >= 2000 && Number(year) <= 2200)
    .map(Number)

  void computeDbPath().then(({ db_path }) => {
    sendToWorker({ cmd: 'preload_reports', db_path, years: normalized })
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
  if (!singleInstanceLockAcquired) return
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
