import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PDFDocument } from 'pdf-lib'

import { capturePngBytes, writeOutputFile } from './export'
import { clamp } from './format'
import {
  asReport,
  getDeckConversationInsights,
  getEmojiTop,
  getLongestMessage,
  getLongestSilence,
  getLongestStreak,
  getMediaCounts,
  getMostActiveHour,
  getMostActiveMonth,
  getNightRatio,
  getPeriod,
  getTotalMessages,
  getWordCloud,
  getYearLabel,
  sanitizeReportForSharing,
  type ConversationInsightKind,
  type PeriodKey,
  type SharePrivacyOptions
} from './report'
import type { SlideCommonProps, SlideDef, ThemeId } from './slideTypes'

import Slide01Cover from './slides/Slide01Cover'
import Slide02TotalMessages from './slides/Slide02TotalMessages'
import Slide03SentVsReceived from './slides/Slide03SentVsReceived'
import Slide04MostActiveMonth from './slides/Slide04MostActiveMonth'
import Slide05MostActiveHour from './slides/Slide05MostActiveHour'
import Slide06NightRatio from './slides/Slide06NightRatio'
import InsightStorySlide from './slides/InsightStorySlide'
import Slide11WordCloud from './slides/Slide11WordCloud'
import Slide12EmojiTop from './slides/Slide12EmojiTop'
import Slide13MediaCounts from './slides/Slide13MediaCounts'
import Slide14LongestMessage from './slides/Slide14LongestMessage'
import Slide15LongestStreak from './slides/Slide15LongestStreak'
import Slide16LongestSilence from './slides/Slide16LongestSilence'
import Slide20End from './slides/Slide20End'

const SLIDE_W = 1920
const SLIDE_H = 1080
const PREVIEW_SCALE = 0.34

const DEFAULT_PRIVACY: SharePrivacyOptions = {
  hideNames: true,
  hideMessageText: true,
  hideExactDates: true
}

function makeInsightSlide(kind: ConversationInsightKind): (props: SlideCommonProps) => JSX.Element {
  return function ConversationInsightSlide(props: SlideCommonProps): JSX.Element {
    return <InsightStorySlide {...props} kind={kind} />
  }
}

function buildStorySlides(report: unknown, period: PeriodKey): SlideDef[] {
  const data = getPeriod(report, period)
  const totalMessages = getTotalMessages(data)
  const slides: SlideDef[] = [
    { id: 'cover', title: 'Обложка', Component: Slide01Cover },
    { id: 'total_messages', title: 'Все сообщения', Component: Slide02TotalMessages },
    { id: 'sent_received', title: 'Диалог в обе стороны', Component: Slide03SentVsReceived }
  ]

  if (getMostActiveMonth(data)) {
    slides.push({ id: 'active_month', title: 'Самый активный месяц', Component: Slide04MostActiveMonth })
  }
  if (getMostActiveHour(data)) {
    slides.push({ id: 'active_hour', title: 'Самый активный час', Component: Slide05MostActiveHour })
  }

  for (const insight of getDeckConversationInsights(report, period)) {
    slides.push({
      id: `insight_${insight.kind}`,
      title: insight.title,
      Component: makeInsightSlide(insight.kind)
    })
  }

  const cultureSlides: SlideDef[] = []
  if (getWordCloud(data).length > 0) {
    cultureSlides.push({ id: 'word_cloud', title: 'Слова года', Component: Slide11WordCloud })
  }
  if (getEmojiTop(data).length > 0) {
    cultureSlides.push({ id: 'emoji', title: 'Эмодзи', Component: Slide12EmojiTop })
  }
  if (Object.values(getMediaCounts(data)).some((count) => count > 0)) {
    cultureSlides.push({ id: 'media', title: 'Медиа', Component: Slide13MediaCounts })
  }
  if (getLongestMessage(data)) {
    cultureSlides.push({ id: 'longest_message', title: 'Самые длинные сообщения', Component: Slide14LongestMessage })
  }
  slides.push(...cultureSlides.slice(0, 2))

  const rhythmSlides: SlideDef[] = []
  if (getLongestStreak(data)) {
    rhythmSlides.push({ id: 'longest_streak', title: 'Самая длинная серия', Component: Slide15LongestStreak })
  }
  if (getLongestSilence(data)) {
    rhythmSlides.push({ id: 'longest_silence', title: 'Самая длинная пауза', Component: Slide16LongestSilence })
  }
  slides.push(...rhythmSlides.slice(0, 2))

  const night = getNightRatio(data)
  if (slides.length < 9 && totalMessages > 0 && (night.count > 0 || night.ratio > 0)) {
    slides.push({ id: 'night_ratio', title: 'Ночные сообщения', Component: Slide06NightRatio })
  }

  for (const candidate of [...cultureSlides.slice(2), ...rhythmSlides.slice(2)]) {
    if (slides.length >= 13 || slides.some((slide) => slide.id === candidate.id)) break
    slides.push(candidate)
  }

  slides.push({ id: 'final', title: 'Wrapped готов', Component: Slide20End })
  return slides.slice(0, 14)
}

type SlidesViewProps = {
  report: unknown
  period: PeriodKey
  onPeriodToggle: () => void
  onOpenDetails: () => void
  onOpenPeople: () => void
  theme: ThemeId
  onThemeChange: (t: ThemeId) => void
  availableYears: Array<{ year: number; messages: number }>
  selectedYear?: number
  onYearChange: (year: number) => void
  yearBuildRunning: boolean
  yearBuildError?: string
}

type ExportKind = 'png' | 'pdf'
type ExportState = {
  running: boolean
  kind: ExportKind
  current: number
  total: number
  message: string
  error?: string
  outputDir?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const pad2 = (n: number) => String(n).padStart(2, '0')

function getInitialSlideIndex(slideCount: number): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('tgwr_slide')
    if (!raw) return 0
    return clamp(Number(raw), 0, Math.max(0, slideCount - 1))
  } catch {
    return 0
  }
}

export default function SlidesView({
  report,
  period,
  onPeriodToggle,
  onOpenDetails,
  onOpenPeople,
  theme,
  onThemeChange,
  availableYears,
  selectedYear,
  onYearChange,
  yearBuildRunning,
  yearBuildError
}: SlidesViewProps): JSX.Element {
  const parsed = useMemo(() => asReport(report), [report])
  const storySlides = useMemo(() => buildStorySlides(parsed, period), [parsed, period])
  const year = getYearLabel(report)
  const periodLabel = period === 'all_time' ? 'ALL' : year

  const [index, setIndex] = useState(() => getInitialSlideIndex(storySlides.length))
  const [direction, setDirection] = useState<1 | -1>(1)
  const [exportState, setExportState] = useState<ExportState | null>(null)
  const [exportSlideIndex, setExportSlideIndex] = useState<number | null>(null)
  const [pendingExportKind, setPendingExportKind] = useState<ExportKind | null>(null)
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0)
  const [privacy, setPrivacy] = useState<SharePrivacyOptions>(DEFAULT_PRIVACY)
  const [scale, setScale] = useState(0.36)

  const exportReport = useMemo(() => sanitizeReportForSharing(parsed, privacy), [parsed, privacy])
  const stageRef = useRef<HTMLDivElement>(null)
  const exportStageRef = useRef<HTMLDivElement>(null)
  const lastWheelAtRef = useRef(0)
  const exportRunningRef = useRef(false)

  const exporting = exportState?.running ?? false
  const shareMode = privacy.hideNames || privacy.hideMessageText || privacy.hideExactDates
  const screenshotMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('tgwr_screenshot') === '1'
    } catch {
      return false
    }
  }, [])
  const captureMode = exporting || screenshotMode

  useEffect(() => {
    setIndex((current) => clamp(current, 0, Math.max(0, storySlides.length - 1)))
    setPreviewSlideIndex((current) => clamp(current, 0, Math.max(0, storySlides.length - 1)))
  }, [storySlides.length])

  const go = useCallback((delta: number) => {
    if (exporting || pendingExportKind) return
    setDirection(delta >= 0 ? 1 : -1)
    setIndex((current) => clamp(current + delta, 0, storySlides.length - 1))
  }, [exporting, pendingExportKind, storySlides.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exporting || pendingExportKind) return
      const key = event.key
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(key)) {
        event.preventDefault()
        go(1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(key)) {
        event.preventDefault()
        go(-1)
      } else if (key === 'Home') {
        event.preventDefault()
        setIndex(0)
        setDirection(-1)
      } else if (key === 'End') {
        event.preventDefault()
        setIndex(storySlides.length - 1)
        setDirection(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exporting, go, pendingExportKind, storySlides.length])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (exporting || pendingExportKind) return
      const now = Date.now()
      if (now - lastWheelAtRef.current < 520 || Math.abs(event.deltaY) < 22) return
      lastWheelAtRef.current = now
      go(event.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [exporting, go, pendingExportKind])

  useLayoutEffect(() => {
    const update = () => {
      const desktopControlsRail = window.innerWidth >= 768 ? 220 : 0
      const mobileControlsBar = window.innerWidth < 768 ? 96 : 0
      const availableW = Math.max(320, window.innerWidth - desktopControlsRail - 32)
      const availableH = Math.max(320, window.innerHeight - mobileControlsBar - 32)
      setScale(clamp(Math.min(availableW / SLIDE_W, availableH / SLIDE_H), 0.12, 0.92))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const runExportTask = useCallback(async (kind: ExportKind) => {
    if (exporting || exportRunningRef.current) return
    exportRunningRef.current = true
    setPendingExportKind(null)
    const directory = await window.tgwr.pickOutputDir()
    if (!directory) {
      exportRunningRef.current = false
      return
    }

    setExportState({
      running: true,
      kind,
      current: 0,
      total: storySlides.length,
      message: 'Подготавливаю слайды…',
      outputDir: directory.displayPath
    })

    try {
      const pdf = kind === 'pdf' ? await PDFDocument.create() : null
      const suffix = shareMode ? '_share' : ''

      for (let slideIndex = 0; slideIndex < storySlides.length; slideIndex += 1) {
        setExportState((current) => current ? {
          ...current,
          current: slideIndex,
          message: `Собираю слайд ${slideIndex + 1} из ${storySlides.length}`
        } : null)
        setExportSlideIndex(slideIndex)
        await nextFrame()
        await nextFrame()
        await sleep(420)

        const exportNode = exportStageRef.current
        if (!exportNode) throw new Error('Сцена экспорта не готова')
        const bytes = await capturePngBytes(exportNode, {
          width: SLIDE_W,
          height: SLIDE_H,
          backgroundColor: '#05070a'
        })

        if (pdf) {
          const image = await pdf.embedPng(bytes)
          pdf.addPage([SLIDE_W, SLIDE_H]).drawImage(image, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H })
        } else {
          await writeOutputFile(directory.token, `slide_${pad2(slideIndex + 1)}${suffix}.png`, bytes)
        }
        setExportState((current) => current ? { ...current, current: slideIndex + 1 } : null)
      }

      if (pdf) {
        setExportState((current) => current ? { ...current, message: 'Сохраняю PDF…' } : null)
        await writeOutputFile(directory.token, `tgwr_wrapped${suffix}.pdf`, await pdf.save())
      }

      setExportState((current) => current ? {
        ...current,
        running: false,
        message: `Готово: ${directory.displayPath}`
      } : null)
      setTimeout(() => setExportState(null), 3500)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setExportState((current) => current ? { ...current, running: false, error: message } : null)
    } finally {
      exportRunningRef.current = false
      setExportSlideIndex(null)
    }
  }, [exporting, shareMode, storySlides.length])

  const openExportPreview = (kind: ExportKind) => {
    setPrivacy(DEFAULT_PRIVACY)
    setPreviewSlideIndex(index)
    setPendingExportKind(kind)
  }

  const ActiveSlide = storySlides[index]?.Component ?? Slide01Cover
  const ExportSlide = exportSlideIndex !== null ? storySlides[exportSlideIndex]?.Component : null
  const PreviewSlide = pendingExportKind ? storySlides[previewSlideIndex]?.Component : null

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[var(--tgwr-bg-0)]"
      data-tgwr-slide-index={index}
      data-tgwr-slide-total={storySlides.length}
    >
      {screenshotMode ? (
        <div className="pointer-events-none absolute left-6 top-6 z-20 flex gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/70">
            {index + 1} / {storySlides.length}
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/70">
            {periodLabel}
          </div>
        </div>
      ) : null}

      <div className="flex h-full w-full items-center justify-center pb-[96px] md:pl-[208px] md:pb-0">
        <motion.div
          ref={stageRef}
          style={{ width: SLIDE_W, height: SLIDE_H, scale, transformOrigin: 'center' }}
          className="relative rounded-[32px] border border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.22)] shadow-[0_24px_110px_rgba(0,0,0,0.42)]"
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={storySlides[index]?.id ?? index}
              data-tgwr-active-slide={index}
              custom={direction}
              initial={captureMode ? { opacity: 1, y: 0 } : { opacity: 0, y: direction > 0 ? 100 : -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={captureMode ? { opacity: 1, y: 0 } : { opacity: 0, y: direction > 0 ? -100 : 100 }}
              transition={{ duration: captureMode ? 0 : 0.4, ease: 'easeOut' }}
              className="h-full w-full"
            >
              <ActiveSlide {...{ report: parsed, period, onPeriodToggle, theme, onThemeChange, exporting: captureMode }} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {!captureMode ? (
        <div className="fixed bottom-5 left-4 right-4 z-[100] flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.88)] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl md:bottom-auto md:left-6 md:right-auto md:top-1/2 md:w-[156px] md:-translate-y-1/2 md:flex-col md:items-stretch md:justify-start md:px-4">
          <div className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.66)] md:block">
            TGWR by IWS
          </div>

          <div className="flex items-center justify-center gap-2 md:grid md:grid-cols-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center text-[12px] font-bold text-white/80">
              {index + 1}/{storySlides.length}
            </div>
            <button
              type="button"
              onClick={onPeriodToggle}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center text-[12px] font-bold text-white/80 transition hover:bg-white/10"
            >
              {periodLabel}
            </button>
          </div>

          {availableYears.length > 1 ? (
            <select
              aria-label="Год Wrapped"
              value={selectedYear ?? year}
              disabled={yearBuildRunning || exporting}
              onChange={(event) => onYearChange(Number(event.target.value))}
              className="max-w-full rounded-xl border border-white/10 bg-[#0a111d] px-2 py-2 text-center text-[11px] font-semibold text-slate-100 outline-none disabled:opacity-60"
            >
              {availableYears.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
            </select>
          ) : null}

          {yearBuildRunning ? (
            <div className="text-center text-[10px] font-semibold leading-tight text-sky-200">Пересчитываю год…</div>
          ) : yearBuildError ? (
            <div className="text-center text-[10px] leading-tight text-red-200">{yearBuildError}</div>
          ) : null}

          <div className="flex items-center justify-center gap-2 md:justify-between">
            <motion.button type="button" onClick={() => go(-1)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10" aria-label="Предыдущий слайд">↑</motion.button>
            <motion.button type="button" onClick={() => go(1)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10" aria-label="Следующий слайд">↓</motion.button>
          </div>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <motion.button type="button" onClick={onOpenDetails} whileHover={{ scale: 1.035 }} whileTap={{ scale: 0.965 }} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10">Детали</motion.button>
          <motion.button type="button" onClick={onOpenPeople} whileHover={{ scale: 1.035 }} whileTap={{ scale: 0.965 }} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10">Люди</motion.button>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <div className="flex items-center justify-center gap-2 md:grid md:grid-cols-1">
            {(['neon', 'cyber', 'midnight'] as ThemeId[]).map((themeId) => (
              <motion.button
                key={themeId}
                type="button"
                onClick={() => onThemeChange(themeId)}
                whileHover={{ scale: 1.035 }}
                whileTap={{ scale: 0.965 }}
                className={[
                  'rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase transition',
                  theme === themeId ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                ].join(' ')}
              >
                {themeId === 'neon' ? 'blue' : themeId === 'cyber' ? 'aqua' : 'premium'}
              </motion.button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <div className="flex items-center justify-center gap-3 md:grid md:grid-cols-2">
            <motion.button type="button" onClick={() => openExportPreview('png')} whileHover={{ scale: 1.035 }} whileTap={{ scale: 0.965 }} className="rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.13)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.22)]">PNG</motion.button>
            <motion.button type="button" onClick={() => openExportPreview('pdf')} whileHover={{ scale: 1.035 }} whileTap={{ scale: 0.965 }} className="rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.13)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200 transition hover:bg-[rgba(var(--tgwr-accent2-rgb),0.22)]">PDF</motion.button>
          </div>
        </div>
      ) : null}

      {ExportSlide ? (
        <div className="fixed left-[-4000px] top-0">
          <div ref={exportStageRef} style={{ width: SLIDE_W, height: SLIDE_H }} className="bg-[#05070a]">
            <ExportSlide {...{ report: exportReport, period, onPeriodToggle, theme, onThemeChange, exporting: true }} />
          </div>
        </div>
      ) : null}

      {pendingExportKind && PreviewSlide ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-auto bg-black/80 p-5 backdrop-blur-md">
          <div className="w-full max-w-[1120px] rounded-[28px] border border-white/10 bg-[#080d16] p-6 shadow-[0_40px_140px_rgba(0,0,0,0.72)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-sky-200">Предпросмотр публикации</div>
                <div className="mt-2 text-2xl font-bold text-slate-50">Именно эти данные попадут в {pendingExportKind.toUpperCase()}</div>
                <div className="mt-2 text-sm text-slate-300/80">{storySlides.length} слайдов · имена, текст и даты можно скрыть независимо.</div>
              </div>
              <button type="button" onClick={() => setPendingExportKind(null)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Закрыть</button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <div className="flex min-h-[390px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div style={{ width: SLIDE_W * PREVIEW_SCALE, height: SLIDE_H * PREVIEW_SCALE }} className="relative overflow-hidden rounded-xl">
                    <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                      <PreviewSlide {...{ report: exportReport, period, onPeriodToggle, theme, onThemeChange, exporting: true }} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setPreviewSlideIndex((current) => clamp(current - 1, 0, storySlides.length - 1))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">← Назад</button>
                  <div className="text-sm font-semibold text-slate-300">{previewSlideIndex + 1}/{storySlides.length} · {storySlides[previewSlideIndex]?.title}</div>
                  <button type="button" onClick={() => setPreviewSlideIndex((current) => clamp(current + 1, 0, storySlides.length - 1))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Дальше →</button>
                </div>
              </div>

              <div className="space-y-3">
                {([
                  ['hideNames', 'Скрыть имена', 'Собеседники получат последовательные псевдонимы.'],
                  ['hideMessageText', 'Скрыть текст', 'Цитаты и фрагменты сообщений не попадут в файлы.'],
                  ['hideExactDates', 'Скрыть точные даты', 'Конкретные дни и даты внутри доказательств будут убраны.']
                ] as const).map(([key, title, description]) => (
                  <label key={key} className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <input
                      type="checkbox"
                      checked={privacy[key]}
                      onChange={(event) => setPrivacy((current) => ({ ...current, [key]: event.target.checked }))}
                      className="mt-1 h-4 w-4 accent-cyan-400"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-100">{title}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-slate-300/75">{description}</span>
                    </span>
                  </label>
                ))}

                <button
                  type="button"
                  onClick={() => setPrivacy({ hideNames: false, hideMessageText: false, hideExactDates: false })}
                  className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Оставить оригинальные данные
                </button>
                <button
                  type="button"
                  onClick={() => void runExportTask(pendingExportKind)}
                  className="w-full rounded-full border border-cyan-300/30 bg-cyan-400/15 px-4 py-3 text-sm font-bold text-cyan-50 hover:bg-cyan-400/25"
                >
                  Выбрать папку и экспортировать
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {exportState ? (
        <div className="fixed left-1/2 top-10 z-[200] w-80 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-1 text-[13px] font-bold tracking-widest text-white/50">{exportState.kind.toUpperCase()} EXPORT</div>
          <div className="mb-3 text-sm font-semibold text-white">{exportState.error ?? exportState.message}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(exportState.current / Math.max(1, exportState.total)) * 100}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
