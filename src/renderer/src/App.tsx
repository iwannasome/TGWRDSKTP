import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DetailsView from './wrapped/DetailsView'
import PeopleView from './wrapped/PeopleView'
import SlidesView from './wrapped/SlidesView'
import YearSelect, { type YearCacheState, type YearOption } from './wrapped/YearSelect'
import type { PeriodKey } from './wrapped/report'
import type { ThemeId } from './wrapped/slideTypes'
import { isRecord } from './wrapped/safe'

type WorkerStatus = {
  status: 'ok' | 'fail'
  message: string
  ts?: string
}

type ImportProgress = {
  stage: string
  current: number
  total: number
  message?: string
}

type ImportSkipReason = {
  reason: string
  count: number
}

type ImportQuality = {
  direction_source: string
  direction_confidence: string
  direction_message_samples: number
}

type ImportSummary = {
  chats: number
  messages: number
  db_path: string
  db_size_bytes: number
  json_chats?: number
  html_chats?: number
  skipped_chats?: number
  unknown_html_chats?: number
  available_years?: YearOption[]
  recommended_year?: number
  skip_reasons?: ImportSkipReason[]
  import_quality?: ImportQuality
}

type ReportBuildState = {
  running: boolean
  progress?: ImportProgress
  error?: string
  notice?: string
}

type ExistingReportPrompt = {
  db_path: string
  report_path: string
  report: unknown
}

function yearOptionsFrom(value: unknown): YearOption[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return null
      const year = typeof item.year === 'number' ? item.year : Number(item.year)
      const messages = typeof item.messages === 'number' ? item.messages : Number(item.messages)
      if (!Number.isInteger(year) || year < 2000 || year > 2200) return null
      return { year, messages: Number.isFinite(messages) ? Math.max(0, messages) : 0 }
    })
    .filter((item): item is YearOption => item !== null)
    .sort((a, b) => b.year - a.year)
}

function reportYearState(value: unknown): { years: YearOption[]; selectedYear?: number } {
  if (!isRecord(value)) return { years: [] }
  const meta = isRecord(value.meta) ? value.meta : {}
  const years = yearOptionsFrom(meta.available_years)
  const rawSelected = meta.msk_year_used
  const selectedYear = typeof rawSelected === 'number' && Number.isInteger(rawSelected) ? rawSelected : undefined
  return { years, selectedYear }
}

function summaryFromExistingReport(prompt: ExistingReportPrompt): ImportSummary {
  const report = isRecord(prompt.report) ? prompt.report : {}
  const periods = isRecord(report.periods) ? report.periods : {}
  const allTime = isRecord(periods.all_time) ? periods.all_time : {}
  const yearState = reportYearState(report)
  return {
    chats: typeof allTime.total_chats_personal === 'number' ? allTime.total_chats_personal : 0,
    messages: typeof allTime.total_messages === 'number' ? allTime.total_messages : 0,
    db_path: prompt.db_path,
    db_size_bytes: 0,
    available_years: yearState.years,
    recommended_year: yearState.selectedYear
  }
}

function skipReasonLabel(reason: string): string {
  switch (reason) {
    case 'non_personal_chat': return 'Группы и каналы'
    case 'empty_chat': return 'Пустые чаты'
    case 'html_group_detected': return 'HTML-группы'
    case 'duplicate_by_id': return 'Дубликаты по Telegram ID'
    case 'duplicate_by_name_and_size': return 'Дубликаты экспортов'
    case 'invalid_chat_shape': return 'Неполные данные чата'
    default: return reason.replaceAll('_', ' ')
  }
}

function directionQualityLabel(quality?: ImportQuality): string {
  if (!quality) return 'Нет диагностики'
  if (quality.direction_source === 'export_metadata') return 'Направление сообщений подтверждено метаданными Telegram'
  if (quality.direction_source === 'inferred') return 'Направление сообщений определено по структуре переписок'
  return 'Не удалось уверенно определить направление сообщений'
}

function loadThemeFromStorage(): ThemeId {
  const v = localStorage.getItem('tgwr_theme')
  if (v === 'neon' || v === 'cyber' || v === 'midnight') return v
  return 'neon'
}

function applyTheme(theme: ThemeId): void {
  const cls = document.body.classList
  cls.remove('theme-neon', 'theme-cyber', 'theme-midnight')
  cls.add(`theme-${theme}`)
}

function formatBytes(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  if (v < 1024) return `${v} B`
  const kb = v / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(2)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

function progressPct(p?: ImportProgress): number {
  if (!p) return 0
  if (p.total <= 0) return 0
  return Math.max(0, Math.min(100, (p.current / p.total) * 100))
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'scan_files':
      return 'Поиск файлов'
    case 'parse_chat':
      return 'Парсинг чатов'
    case 'insert_db':
      return 'Запись в базу'
    case 'index_db':
      return 'Индексация'
    case 'compute_metrics':
      return 'Сбор метрик'
    default:
      return String(stage || '')
  }
}

function isScreenshotMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('tgwr_screenshot') === '1'
  } catch {
    return false
  }
}

export default function App(): JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(() => loadThemeFromStorage())
  const [period, setPeriod] = useState<PeriodKey>('year')
  const [view, setView] = useState<'setup' | 'slides' | 'details' | 'people'>('setup')

  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
    status: 'fail',
    message: 'Worker not started'
  })
  const lastPongAtRef = useRef(0)
  const [workerError, setWorkerError] = useState<string | null>(null)

  const [exportDir, setExportDir] = useState<string>('')

  const [importRunning, setImportRunning] = useState<boolean>(false)
  const importRunningRef = useRef(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | undefined>(undefined)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)

  const [reportBuild, setReportBuild] = useState<ReportBuildState>({ running: false })
  const reportBuildRunningRef = useRef(false)

  const [dbPath, setDbPath] = useState<string | null>(null)
  const [reportPath, setReportPath] = useState<string | null>(null)
  const [report, setReport] = useState<unknown | null>(null)
  const [reportAvailable, setReportAvailable] = useState(false)
  const [availableYears, setAvailableYears] = useState<YearOption[]>([])
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined)
  const [cachedYears, setCachedYears] = useState<Set<number>>(() => new Set())
  const [preparingYears, setPreparingYears] = useState<Set<number>>(() => new Set())
  const [loadingYear, setLoadingYear] = useState<number | undefined>(undefined)
  const [reportStale, setReportStale] = useState(false)
  const preloadSessionKeyRef = useRef('')
  const [existingReportPrompt, setExistingReportPrompt] = useState<ExistingReportPrompt | null>(null)
  const [existingReportError, setExistingReportError] = useState<string | null>(null)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('tgwr_theme', theme)
  }, [theme])

  useEffect(() => {
    const timer = window.setTimeout(() => window.tgwr.rendererReady(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    importRunningRef.current = importRunning
  }, [importRunning])

  useEffect(() => {
    reportBuildRunningRef.current = reportBuild.running
  }, [reportBuild.running])

  const togglePeriod = useCallback(() => {
    setPeriod((p) => (p === 'all_time' ? 'year' : 'all_time'))
  }, [])

  const loadReport = useCallback(async (isStartup = false): Promise<boolean> => {
    try {
      const res = await window.tgwr.loadReport()

      if (typeof res?.db_path === 'string' && res.db_path) {
        setDbPath(res.db_path)
      }
      if (typeof res?.report_path === 'string' && res.report_path) {
        setReportPath(res.report_path)
      }

      if (!res || !res.ok) {
        setReportAvailable(false)
        if (!isStartup) {
          setReportBuild((prev) => ({
            ...prev,
            running: false,
            error: `Ошибка бекенда: ${res?.error || 'отчет не найден'}`
          }))
        }
        return false
      }

      if (!res.report) {
        setReportAvailable(false)
        if (!isStartup) {
          setReportBuild((prev) => ({
            ...prev,
            running: false,
            error: `Отчет загружен, но данные отсутствуют.`
          }))
        }
        return false
      }

      // Страховка: если бекенд отдал JSON строкой, парсим его
      let parsedReport = res.report
      if (typeof parsedReport === 'string') {
        try {
          parsedReport = JSON.parse(parsedReport)
        } catch {
          setReportAvailable(false)
          if (!isStartup) {
            setReportBuild((prev) => ({ ...prev, running: false, error: 'Ошибка парсинга JSON отчета.' }))
          }
          return false
        }
      }

      setDbPath(res.db_path)
      setReportPath(res.report_path)
      setReport(parsedReport) // Передаем именно объект!
      const yearState = reportYearState(parsedReport)
      setAvailableYears(yearState.years)
      setSelectedYear(yearState.selectedYear)
      setCachedYears(new Set(Array.isArray(res.cached_years) ? res.cached_years : []))
      setReportStale(res.report_stale === true)
      setReportAvailable(true)
      setView('slides')

      // Сбрасываем ошибку, если загрузилось
      setReportBuild((prev) => ({ ...prev, running: false, error: undefined }))
      return true
    } catch (err) {
      setReportAvailable(false)
      if (!isStartup) {
        setReportBuild((prev) => ({
          ...prev,
          running: false,
          error: `Критическая ошибка IPC: ${String(err)}`
        }))
      }
      return false
    }
  }, [])

  // Ask what to do with an existing report.json on startup.
  useEffect(() => {
    let cancelled = false

    const checkExistingReport = async () => {
      if (isScreenshotMode()) {
        void loadReport(true)
        return
      }

      const res = await window.tgwr.loadReport()
      if (cancelled) return

      if (typeof res?.db_path === 'string' && res.db_path) {
        setDbPath(res.db_path)
      }
      if (typeof res?.report_path === 'string' && res.report_path) {
        setReportPath(res.report_path)
      }

      if (res?.ok && typeof res.db_path === 'string' && typeof res.report_path === 'string') {
        setReportAvailable(true)
        setExistingReportPrompt({
          db_path: res.db_path,
          report_path: res.report_path,
          report: res.report
        })
      }
    }

    void checkExistingReport()

    return () => {
      cancelled = true
    }
  }, [loadReport])

  const onOpenExistingReport = useCallback(() => {
    const prompt = existingReportPrompt
    if (!prompt) return
    setExistingReportError(null)
    setExistingReportPrompt(null)
    void loadReport()
  }, [existingReportPrompt, loadReport])

  const onResetExistingReport = useCallback(async () => {
    const prompt = existingReportPrompt
    if (!prompt) return

    setExistingReportError(null)
    const res = await window.tgwr.resetReport()
    if (!res.ok) {
      setExistingReportError(res.error ?? 'Не удалось подготовить новый отчёт')
      return
    }

    const summary = summaryFromExistingReport(prompt)
    const yearState = reportYearState(prompt.report)
    setExistingReportPrompt(null)
    setReport(null)
    setReportAvailable(false)
    setReportPath(res.report_path)
    setDbPath(res.db_path)
    setImportSummary(summary)
    setAvailableYears(yearState.years)
    setSelectedYear(yearState.selectedYear ?? yearState.years[0]?.year)
    setCachedYears(new Set())
    setPreparingYears(new Set())
    setLoadingYear(undefined)
    setReportStale(false)
    preloadSessionKeyRef.current = ''
    setReportBuild({ running: false })
    setView('setup')
  }, [existingReportPrompt])

  const onDeleteAllData = useCallback(async () => {
    const confirmed = window.confirm(
      'Удалить локальную базу переписок и готовый отчёт? Это действие нельзя отменить.'
    )
    if (!confirmed) return

    setExistingReportError(null)
    const res = await window.tgwr.deleteAllData()
    if (!res.ok) {
      const message = res.error ?? 'Не удалось удалить локальные данные'
      setExistingReportError(message)
      setImportError(message)
      return
    }

    setExistingReportPrompt(null)
    setReport(null)
    setReportAvailable(false)
    setReportPath(res.report_path)
    setDbPath(res.db_path)
    setImportSummary(null)
    setAvailableYears([])
    setSelectedYear(undefined)
    setCachedYears(new Set())
    setPreparingYears(new Set())
    setLoadingYear(undefined)
    setReportStale(false)
    preloadSessionKeyRef.current = ''
    setReportBuild({ running: false })
    setView('setup')
  }, [])

  // Subscribe to worker events
  useEffect(() => {
    return window.tgwr.onWorkerEvent((payload) => {
      if (!isRecord(payload)) return
      const type = payload.type

      // PONG = worker alive (we use this for heartbeat)
      if (type === 'pong') {
        const ver = typeof payload.version === 'string' ? payload.version : ''
        lastPongAtRef.current = Date.now()
        setWorkerError(null)
        setWorkerStatus({
          status: 'ok',
          message: `Подключен (отзывается${ver ? ` v${ver}` : ''})`,
          ts: new Date().toISOString()
        })
        return
      }

      if (type === 'worker_status') {
        const status = payload.status === 'ok' ? 'ok' : 'fail'
        const message = typeof payload.message === 'string' ? payload.message : ''
        if (status === 'ok') {
          setWorkerError(null)
          setWorkerStatus({
            status,
            message: message || 'Connected',
            ts: typeof payload.ts === 'string' ? payload.ts : new Date().toISOString()
          })
        } else {
          setWorkerStatus({
            status,
            message: message || 'Disconnected',
            ts: typeof payload.ts === 'string' ? payload.ts : new Date().toISOString()
          })
        }
        return
      }

      if (type === 'progress') {
        const stage = typeof payload.stage === 'string' ? payload.stage : ''

        // Compatible progress:
        // - new: { current, total, message }
        // - legacy: { percent, current_chat, current_file }
        const percent = typeof payload.percent === 'number' ? payload.percent : undefined
        const current =
          typeof payload.current === 'number'
            ? payload.current
            : typeof percent === 'number'
              ? percent
              : 0
        const total = typeof payload.total === 'number' && payload.total > 0 ? payload.total : 100

        let message = typeof payload.message === 'string' ? payload.message : undefined
        if (!message) {
          const cc = typeof payload.current_chat === 'string' ? payload.current_chat : ''
          const cf = typeof payload.current_file === 'string' ? payload.current_file : ''
          const parts = [cc, cf]
            .map((s) => s.trim())
            .filter(Boolean)
          if (parts.length) message = parts.join(' — ')
        }

        const p: ImportProgress = { stage, current, total, message }

        if (stage === 'scan_files' || stage === 'parse_chat' || stage === 'insert_db' || stage === 'index_db') {
          setImportProgress(p)
          return
        }
        if (stage === 'compute_metrics') {
          setReportBuild((prev) => ({ ...prev, progress: p }))
          return
        }
        return
      }

      if (type === 'import_done') {
        const years = yearOptionsFrom(payload.available_years)
        const recommendedYear = typeof payload.recommended_year === 'number' ? payload.recommended_year : years[0]?.year
        const skipReasons = Array.isArray(payload.skip_reasons)
          ? payload.skip_reasons.flatMap((item) => {
              if (!isRecord(item) || typeof item.reason !== 'string' || typeof item.count !== 'number') return []
              return [{ reason: item.reason, count: Math.max(0, item.count) }]
            })
          : []
        const rawQuality = isRecord(payload.import_quality) ? payload.import_quality : null
        const importQuality: ImportQuality | undefined = rawQuality ? {
          direction_source: typeof rawQuality.direction_source === 'string' ? rawQuality.direction_source : 'unknown',
          direction_confidence: typeof rawQuality.direction_confidence === 'string' ? rawQuality.direction_confidence : 'unknown',
          direction_message_samples: typeof rawQuality.direction_message_samples === 'number' ? rawQuality.direction_message_samples : 0
        } : undefined
        const summary: ImportSummary = {
          chats: typeof payload.chats === 'number' ? payload.chats : 0,
          messages: typeof payload.messages === 'number' ? payload.messages : 0,
          db_path: typeof payload.db_path === 'string' ? payload.db_path : '',
          db_size_bytes: typeof payload.db_size_bytes === 'number' ? payload.db_size_bytes : 0,
          json_chats: typeof payload.json_chats === 'number' ? payload.json_chats : undefined,
          html_chats: typeof payload.html_chats === 'number' ? payload.html_chats : undefined,
          skipped_chats: typeof payload.skipped_chats === 'number' ? payload.skipped_chats : undefined,
          unknown_html_chats: typeof payload.unknown_html_chats === 'number' ? payload.unknown_html_chats : undefined,
          available_years: years,
          recommended_year: recommendedYear,
          skip_reasons: skipReasons,
          import_quality: importQuality
        }

        setImportRunning(false)
        importRunningRef.current = false
        setImportProgress(undefined)
        setImportError(null)
        setImportNotice(null)
        setImportSummary(summary)
        setDbPath(summary.db_path)
        setAvailableYears(years)
        setSelectedYear(recommendedYear)
        setCachedYears(new Set())
        setPreparingYears(new Set())
        setLoadingYear(undefined)
        setReportStale(false)
        preloadSessionKeyRef.current = ''
        return
      }

      if (type === 'report_done') {
        const completedYear = typeof payload.msk_year_used === 'number' ? payload.msk_year_used : undefined
        if (completedYear !== undefined) {
          setCachedYears((current) => new Set(current).add(completedYear))
          setPreparingYears((current) => {
            const next = new Set(current)
            next.delete(completedYear)
            return next
          })
        }
        setReportBuild({ running: false })
        reportBuildRunningRef.current = false
        setLoadingYear(undefined)
        const rp = typeof payload.report_path === 'string' ? payload.report_path : null
        if (rp) setReportPath(rp)
        void loadReport()
        return
      }

      if (type === 'report_preload_queued') {
        const years = Array.isArray(payload.years)
          ? payload.years.filter((year): year is number => typeof year === 'number' && Number.isInteger(year))
          : []
        if (years.length > 0) {
          setPreparingYears((current) => new Set([...current, ...years]))
        }
        return
      }

      if (type === 'report_preload_started') {
        const year = typeof payload.msk_year_used === 'number' ? payload.msk_year_used : undefined
        if (year !== undefined) setPreparingYears((current) => new Set(current).add(year))
        return
      }

      if (type === 'report_cached') {
        const year = typeof payload.msk_year_used === 'number' ? payload.msk_year_used : undefined
        if (year !== undefined) {
          setCachedYears((current) => new Set(current).add(year))
          setPreparingYears((current) => {
            const next = new Set(current)
            next.delete(year)
            return next
          })
        }
        return
      }

      if (type === 'report_preload_cancelled' || type === 'report_preload_error') {
        const year = typeof payload.msk_year_used === 'number' ? payload.msk_year_used : undefined
        if (year !== undefined) {
          setPreparingYears((current) => {
            const next = new Set(current)
            next.delete(year)
            return next
          })
        }
        return
      }

      if (type === 'report_preload_idle') {
        setPreparingYears(new Set())
        return
      }

      if (type === 'report_cancelled') {
        setReportBuild({ running: false, notice: 'Сборка Wrapped отменена. Импортированная база сохранена.' })
        reportBuildRunningRef.current = false
        setLoadingYear(undefined)
        return
      }

      if (type === 'report_error') {
        const msg = typeof payload.message === 'string' ? payload.message : 'Report error'
        setReportBuild({ running: false, error: msg })
        reportBuildRunningRef.current = false
        setLoadingYear(undefined)
        return
      }

      if (type === 'import_error') {
        const msg = typeof payload.message === 'string' ? payload.message : 'Import error'
        setImportRunning(false)
        importRunningRef.current = false
        setImportProgress(undefined)
        setImportError(msg === 'Import cancelled' ? null : msg)
        setImportNotice(msg === 'Import cancelled' ? 'Импорт отменён. Предыдущий Wrapped и база остались без изменений.' : null)
        return
      }

      if (type === 'error') {
        const msg = typeof payload.message === 'string' ? payload.message : 'Worker error'
        if (importRunning) {
          setImportRunning(false)
          importRunningRef.current = false
          setImportProgress(undefined)
          setImportError(msg)
          return
        }
        if (reportBuild.running) {
          setReportBuild({ running: false, error: msg })
          reportBuildRunningRef.current = false
          return
        }
        setWorkerError(msg)
        setWorkerStatus({ status: 'fail', message: msg, ts: new Date().toISOString() })
        return
      }
    })
  }, [dbPath, importRunning, loadReport, reportBuild.running])

  // Auto-ping + watchdog
  useEffect(() => {
    const pingEveryMs = 5000
    const pongTimeoutMs = 12000

    const doPing = () => {
      try {
        window.tgwr.pingWorker()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setWorkerError(`Ping failed: ${msg}`)
        setWorkerStatus({ status: 'fail', message: 'Ping failed', ts: new Date().toISOString() })
      }
    }

    doPing()

    const pingTimer = setInterval(doPing, pingEveryMs)
    const watchdog = setInterval(() => {
      const lastPongAt = lastPongAtRef.current
      if (!lastPongAt) return
      const delta = Date.now() - lastPongAt
      if (delta > pongTimeoutMs) {
        setWorkerError(`No pong for ${Math.round(delta / 1000)}s`)
        setWorkerStatus({
          status: 'fail',
          message: `No pong for ${Math.round(delta / 1000)}s`,
          ts: new Date().toISOString()
        })
      }
    }, 1000)

    return () => {
      clearInterval(pingTimer)
      clearInterval(watchdog)
    }
  }, [])

  const canImport = workerStatus.status === 'ok' && exportDir.trim().length > 0 && !importRunning && !reportBuild.running

  const onPickExportDir = useCallback(async () => {
    const dir = await window.tgwr.pickExportDir()
    if (!dir) return
    setExportDir(dir)
    setImportSummary(null)
    setImportError(null)
    setImportNotice(null)
    setReport(null)
    setReportPath(null)
    setReportAvailable(false)
    setAvailableYears([])
    setSelectedYear(undefined)
    setCachedYears(new Set())
    setPreparingYears(new Set())
    setLoadingYear(undefined)
    setReportStale(false)
    preloadSessionKeyRef.current = ''
    setReportBuild({ running: false })
  }, [])

  const onStartImport = useCallback(() => {
    if (importRunningRef.current || reportBuildRunningRef.current || workerStatus.status !== 'ok') return
    const dir = exportDir.trim()
    if (!dir) return

    importRunningRef.current = true
    setImportRunning(true)
    setImportProgress({ stage: 'scan_files', current: 0, total: 1 })
    setImportError(null)
    setImportNotice(null)
    setImportSummary(null)
    setReport(null)
    setReportPath(null)
    setReportAvailable(false)
    setCachedYears(new Set())
    setPreparingYears(new Set())
    setLoadingYear(undefined)
    setReportStale(false)
    preloadSessionKeyRef.current = ''

    try {
      window.tgwr.importExport(dir)
    } catch (err) {
      importRunningRef.current = false
      setImportRunning(false)
      setImportProgress(undefined)
      setImportError(err instanceof Error ? err.message : String(err))
      setImportNotice(null)
    }
  }, [exportDir, workerStatus.status])

  const onCancelCurrentWork = useCallback(() => {
    if (!importRunningRef.current && !reportBuildRunningRef.current) return
    window.tgwr.cancelWorker()
  }, [])

  const canBuildReport = !!importSummary && !!selectedYear && !reportBuild.running && !importRunning
  const canOpenReport = reportAvailable && !reportBuild.running && !importRunning

  const requestReportBuild = useCallback((year: number) => {
    if (importRunningRef.current) return
    reportBuildRunningRef.current = true
    setLoadingYear(year)
    setReportBuild({ running: true, progress: { stage: 'compute_metrics', current: 0, total: 1 } })
    try {
      setSelectedYear(year)
      window.tgwr.buildReport(year)
    } catch (err) {
      reportBuildRunningRef.current = false
      setLoadingYear(undefined)
      setReportBuild({
        running: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }, [])

  const onBuildReport = useCallback(() => {
    if (!importSummary || !selectedYear) return
    requestReportBuild(selectedYear)
  }, [importSummary, requestReportBuild, selectedYear])

  const onYearChange = useCallback((year: number) => {
    if (year === selectedYear) return
    requestReportBuild(year)
  }, [requestReportBuild, selectedYear])

  useEffect(() => {
    if (!report || workerStatus.status !== 'ok' || isScreenshotMode() || availableYears.length < 2) return
    const years = availableYears
      .map((option) => option.year)
      .filter((year) => year !== selectedYear)
      .sort((left, right) => Math.abs(left - (selectedYear ?? left)) - Math.abs(right - (selectedYear ?? right)))
    const sessionKey = `${dbPath ?? ''}:${years.join(',')}`
    if (!years.length || preloadSessionKeyRef.current === sessionKey) return
    const timer = window.setTimeout(() => {
      preloadSessionKeyRef.current = sessionKey
      window.tgwr.preloadReports(years)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [availableYears, dbPath, report, selectedYear, workerStatus.status])

  useEffect(() => {
    if (!report || !reportStale || !selectedYear || workerStatus.status !== 'ok' || reportBuildRunningRef.current) return
    requestReportBuild(selectedYear)
  }, [report, reportStale, requestReportBuild, selectedYear, workerStatus.status])

  const yearCacheState = useMemo<Record<number, YearCacheState>>(() => {
    const state: Record<number, YearCacheState> = {}
    for (const option of availableYears) {
      state[option.year] = cachedYears.has(option.year)
        ? 'ready'
        : preparingYears.has(option.year)
          ? 'preparing'
          : 'idle'
    }
    return state
  }, [availableYears, cachedYears, preparingYears])

  const mainContent = useMemo(() => {
    if (report && view === 'slides') {
      return (
        <SlidesView
          report={report}
          period={period}
          onPeriodToggle={togglePeriod}
          onOpenDetails={() => setView('details')}
          onOpenPeople={() => setView('people')}
          theme={theme}
          onThemeChange={setTheme}
          availableYears={availableYears}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          yearCacheState={yearCacheState}
          loadingYear={loadingYear}
          yearBuildRunning={reportBuild.running}
          yearBuildError={reportBuild.error}
        />
      )
    }

    if (report && view === 'details') {
      return (
        <DetailsView
          report={report}
          period={period}
          onPeriodToggle={togglePeriod}
          onClose={() => setView('slides')}
          onOpenPeople={() => setView('people')}
        />
      )
    }

    if (report && view === 'people') {
      return (
        <PeopleView
          report={report}
          period={period}
          onPeriodToggle={togglePeriod}
          onClose={() => setView('slides')}
          onOpenDetails={() => setView('details')}
        />
      )
    }

    return (
      <div className="relative h-full w-full overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid min-h-full w-full max-w-[1360px] gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="flex min-h-[220px] flex-col justify-between rounded-[24px] border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.58)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.30)] backdrop-blur-xl lg:sticky lg:top-4 lg:h-[calc(100vh-32px)]">
            <div>
              <div className="inline-flex rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.22)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-3 py-1.5 text-[12px] font-semibold text-sky-100">
                TGWR by IWS · v0.2.0 · local
              </div>
              <div className="mt-5 text-[34px] font-semibold leading-tight text-slate-50">Telegram Wrapped без облака</div>
              <div className="mt-3 max-w-[260px] text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.90)]">
                Выбери экспорт Telegram Desktop, TGWR by IWS соберет приватный recap на твоем компьютере и сразу откроет story deck.
              </div>

              <div className="mt-6 grid gap-2">
                {['Выбери экспорт', 'Проанализируй локально', 'Открой Wrapped'].map((label, idx) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.16)] text-[12px] font-bold text-sky-100">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 text-[13px] font-semibold text-slate-100">{label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    Модуль анализа
                  </div>
                  <div
                    className={[
                      'h-2.5 w-2.5 rounded-full',
                      workerStatus.status === 'ok' ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.65)]' : 'bg-red-400'
                    ].join(' ')}
                  />
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-100">
                  {workerStatus.status === 'ok' ? 'Готов к работе' : 'Не запущен'}
                </div>
                <div className="mt-1 break-words text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                  {workerStatus.message}
                </div>
                {workerError ? (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-100">
                    {workerError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-4 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
              <div className="font-semibold uppercase tracking-[0.16em]">Авторский канал</div>
              <a
                href="https://t.me/shizikjke"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-bold uppercase tracking-wider text-slate-200 transition hover:text-cyan-300"
              >
                IWANNASOME
              </a>
            </div>
          </aside>

          <main className="min-w-0 py-1 lg:py-4">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-[24px] border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.46)] px-5 py-4 backdrop-blur-xl">
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                  Локальный Telegram Wrapped
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-50">Собери Telegram Wrapped</div>
              </div>
              <button
                type="button"
                disabled={!canOpenReport}
                onClick={() => {
                  if (!canOpenReport) return
                  void loadReport()
                }}
                className={[
                  'rounded-full border px-4 py-2 text-sm font-semibold transition',
                  canOpenReport
                    ? 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                    : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.58)]'
                ].join(' ')}
              >
                Открыть wrapped
              </button>
              <button
                type="button"
                disabled={importRunning || reportBuild.running || (!reportAvailable && !importSummary)}
                onClick={onDeleteAllData}
                className="rounded-full border border-red-400/20 bg-red-500/[0.08] px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Удалить локальные данные
              </button>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
              <section className="rounded-[24px] border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.50)] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.24)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-3 py-1 text-[12px] font-semibold text-sky-100">Шаг 1</div>
                  <div className="mt-3 text-[18px] font-semibold text-slate-50">Выбери Telegram Export</div>
                  <div className="mt-1 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                    Выбери готовую папку экспорта из Telegram Desktop. JSON предпочтительнее, HTML тоже поддерживается.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onPickExportDir}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Выбрать папку
                  </button>
                  <button
                    type="button"
                    disabled={!canImport}
                    onClick={onStartImport}
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-semibold transition',
                      canImport
                        ? 'border-[rgba(var(--tgwr-accent1-rgb),0.35)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] text-slate-50 hover:bg-[rgba(var(--tgwr-accent1-rgb),0.16)]'
                        : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.7)]'
                    ].join(' ')}
                  >
                    Анализировать локально
                  </button>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100 marker:content-none">
                  Как подготовить экспорт Telegram
                </summary>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                  <li>В Telegram Desktop открой «Настройки → Продвинутые настройки → Экспорт данных из Telegram».</li>
                  <li>Выбери личные чаты и машиночитаемый JSON. Если есть только HTML, TGWR попробует прочитать и его.</li>
                  <li>Дождись завершения экспорта и выбери его папку здесь.</li>
                </ol>
                <div className="mt-3 text-[13px] leading-relaxed text-sky-100/85">
                  TGWR не запрашивает пароль, код Telegram или доступ к аккаунту: он читает только выбранную тобой папку на этом компьютере.
                </div>
              </details>

              {availableYears.length > 0 ? (
                <div className="mt-4 block rounded-2xl border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    Год Wrapped
                  </span>
                  <YearSelect
                    options={availableYears}
                    value={selectedYear}
                    onChange={setSelectedYear}
                    cacheState={yearCacheState}
                    loadingYear={loadingYear}
                    disabled={reportBuild.running}
                    variant="setup"
                  />
                  <span className="mt-2 block text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.82)]">
                    Можно выбрать любой год, найденный в экспорте. Раздел «За всё время» останется доступен внутри Wrapped.
                  </span>
                </div>
              ) : null}

              {exportDir ? (
                <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
                  <div className="text-sm font-semibold text-slate-100">Папка экспорта выбрана</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-slate-300/80">Нажми «Анализировать локально», чтобы начать импорт. Переписка останется на этом компьютере.</div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-slate-300/75">Показать путь к папке</summary>
                    <div className="mt-2 max-h-20 overflow-auto break-all font-mono text-[12px] text-slate-100/85">{exportDir}</div>
                  </details>
                </div>
              ) : null}

              {importRunning ? (
                <div className="mt-4" role="status" aria-live="polite">
                  <div className="flex items-center justify-between text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                    <span>{importProgress ? stageLabel(importProgress.stage) : '…'}</span>
                    <span>{Math.round(progressPct(importProgress))}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.75),rgba(var(--tgwr-accent2-rgb),0.65))]"
                      style={{ width: `${progressPct(importProgress)}%` }}
                    />
                  </div>
                  {importProgress?.message ? (
                    <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">{importProgress.message}</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={onCancelCurrentWork}
                    className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Отменить импорт
                  </button>
                </div>
              ) : null}

              {importError ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                  {importError}
                </div>
              ) : null}

              {importNotice ? (
                <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-4 text-sm text-sky-50" role="status">
                  {importNotice}
                </div>
              ) : null}

              {importSummary ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                      Личные диалоги
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-100">{importSummary.chats}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                      Сообщения
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-100">{importSummary.messages}</div>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-100/75">
                      Качество импорта
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-100">
                      {directionQualityLabel(importSummary.import_quality)}
                    </div>
                    {importSummary.skip_reasons && importSummary.skip_reasons.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {importSummary.skip_reasons.map((item) => (
                          <span key={item.reason} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[12px] text-slate-200">
                            {skipReasonLabel(item.reason)} · {item.count}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-[13px] text-slate-300/75">Чаты не пропускались.</div>
                    )}
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                    <div className="text-sm font-semibold text-slate-100">Импорт сохранён только локально</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                      TGWR занял {formatBytes(importSummary.db_size_bytes)} на этом компьютере. В любой момент можно удалить базу и готовые отчёты кнопкой сверху.
                    </div>
                  </div>
                </div>
              ) : null}
              </section>

              <section className="rounded-[24px] border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.50)] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.24)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full border border-[rgba(var(--tgwr-accent2-rgb),0.18)] bg-[rgba(var(--tgwr-accent2-rgb),0.10)] px-3 py-1 text-[12px] font-semibold text-violet-100">Шаг 2</div>
                  <div className="mt-3 text-[18px] font-semibold text-slate-50">Сгенерируй приватный отчет</div>
                  <div className="mt-1 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">TGWR посчитает метрики на этом компьютере и соберёт твой Wrapped. Переписки никуда не отправляются.</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!canBuildReport}
                    onClick={onBuildReport}
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-semibold transition',
                      canBuildReport
                        ? 'border-[rgba(var(--tgwr-accent2-rgb),0.35)] bg-[rgba(var(--tgwr-accent2-rgb),0.10)] text-slate-50 hover:bg-[rgba(var(--tgwr-accent2-rgb),0.16)]'
                        : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.7)]'
                    ].join(' ')}
                  >
                    Собрать Wrapped
                  </button>
                </div>
              </div>

              {reportBuild.running ? (
                <div className="mt-4" role="status" aria-live="polite">
                  <div className="flex items-center justify-between text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                    <span>{stageLabel(reportBuild.progress?.stage ?? 'compute_metrics')}</span>
                    <span>{Math.round(progressPct(reportBuild.progress))}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-white/5">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent2-rgb),0.70),rgba(var(--tgwr-accent1-rgb),0.60))]"
                      style={{ width: `${progressPct(reportBuild.progress)}%` }}
                    />
                  </div>
                  {reportBuild.progress?.message ? (
                    <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">{reportBuild.progress.message}</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={onCancelCurrentWork}
                    className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Отменить сборку
                  </button>
                </div>
              ) : null}

              {reportBuild.error ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                  {reportBuild.error}
                </div>
              ) : null}

              {reportBuild.notice ? (
                <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-4 text-sm text-sky-50" role="status">
                  {reportBuild.notice}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                <div className="text-sm font-semibold text-slate-100">Готовый Wrapped хранится локально</div>
                <div className="mt-1 text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                  Его можно открыть позже, пересобрать из этой же базы или полностью удалить вместе с импортированными данными.
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-semibold text-slate-100">Шаг 3</div>
                  <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
                    Когда отчет готов, открой Wrapped как Telegram Story.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canOpenReport}
                  onClick={() => {
                    if (!canOpenReport) return
                    void loadReport()
                  }}
                  className={[
                    'rounded-full border px-4 py-2 text-sm font-semibold transition',
                    canOpenReport
                      ? 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                      : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.58)]'
                  ].join(' ')}
                >
                  Открыть wrapped
                </button>
              </div>
              </section>

            </div>
          </main>
        </div>

        {existingReportPrompt ? (
          <div role="dialog" aria-modal="true" aria-labelledby="tgwr-existing-report-title" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
            <div className="w-full max-w-[560px] rounded-2xl border border-white/10 bg-[#080d16] p-6 shadow-[0_40px_140px_rgba(0,0,0,0.75)]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.20em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                Найден старый отчет
              </div>
              <div id="tgwr-existing-report-title" className="mt-3 text-2xl font-bold text-slate-100">Что открыть при запуске?</div>
              <div className="mt-3 text-sm leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                В TGWR уже есть готовый Wrapped. Его можно открыть, пересобрать из этой же локальной базы или полностью стереть все данные.
              </div>

              {existingReportError ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                  {existingReportError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={onDeleteAllData}
                  className="rounded-full border border-red-400/25 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
                >
                  Стереть все данные
                </button>
                <button
                  type="button"
                  onClick={onResetExistingReport}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                >
                  Собрать новый отчёт
                </button>
                <button
                  type="button"
                  onClick={onOpenExistingReport}
                  className="rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.35)] bg-[rgba(var(--tgwr-accent1-rgb),0.12)] px-5 py-2.5 text-sm font-semibold text-slate-50 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.18)]"
                >
                  Открыть старый
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }, [
    availableYears,
    canBuildReport,
    canImport,
    canOpenReport,
    dbPath,
    exportDir,
    existingReportError,
    existingReportPrompt,
    importError,
    importNotice,
    importProgress,
    importRunning,
    importSummary,
    loadReport,
    loadingYear,
    onBuildReport,
    onCancelCurrentWork,
    onDeleteAllData,
    onOpenExistingReport,
    onPickExportDir,
    onResetExistingReport,
    onStartImport,
    onYearChange,
    period,
    report,
    reportAvailable,
    reportBuild.error,
    reportBuild.progress,
    reportBuild.running,
    reportPath,
    selectedYear,
    theme,
    togglePeriod,
    view,
    workerError,
    workerStatus.message,
    workerStatus.status,
    yearCacheState
  ])

  return (
    <div className="h-screen w-screen" data-tgwr-view={view}>
      {mainContent}
    </div>
  )
}
