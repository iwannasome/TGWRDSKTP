import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PDFDocument } from 'pdf-lib'

import { capturePngBytes, writeOutputFile } from './export'
import { clamp } from './format'
import { asReport, getYearLabel, type ConversationInsightKind, type PeriodKey } from './report'
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
import Slide19Achievements from './slides/Slide19Achievements'
import Slide20End from './slides/Slide20End'
import Slide21Credits from './slides/Slide21Credits'


const SLIDE_W = 1920
const SLIDE_H = 1080

function makeInsightSlide(kind: ConversationInsightKind): (props: SlideCommonProps) => JSX.Element {
  return function ConversationInsightSlide(props: SlideCommonProps): JSX.Element {
    return <InsightStorySlide {...props} kind={kind} />
  }
}

const slides: SlideDef[] = [
  { id: 's1', title: 'Cover', Component: Slide01Cover },
  { id: 's2', title: 'Total Messages', Component: Slide02TotalMessages },
  { id: 's3', title: 'Sent vs Received', Component: Slide03SentVsReceived },
  { id: 's4', title: 'Most Active Month', Component: Slide04MostActiveMonth },
  { id: 's5', title: 'Most Active Hour', Component: Slide05MostActiveHour },
  { id: 's6', title: 'Night Ratio', Component: Slide06NightRatio },
  { id: 's7_main_person', title: 'Main Person Insight', Component: makeInsightSlide('main_person') },
  { id: 's8_stable_dialog', title: 'Stable Dialog Insight', Component: makeInsightSlide('stable_dialog') },
  { id: 's9_comeback', title: 'Comeback Insight', Component: makeInsightSlide('comeback') },
  { id: 's10_closer_dialog', title: 'Closer Dialog Insight', Component: makeInsightSlide('closer_dialog') },
  { id: 's11_night_companion', title: 'Night Companion Insight', Component: makeInsightSlide('night_companion') },
  { id: 's12_mutual_dialog', title: 'Mutual Dialog Insight', Component: makeInsightSlide('mutual_dialog') },
  { id: 's13_media_bond', title: 'Media Bond Insight', Component: makeInsightSlide('media_bond') },
  { id: 's14_word_cloud', title: 'Word Cloud', Component: Slide11WordCloud },
  { id: 's15_top_emojis', title: 'Top Emojis', Component: Slide12EmojiTop },
  { id: 's16_media_counts', title: 'Media Counts', Component: Slide13MediaCounts },
  { id: 's17_longest_message', title: 'Longest Message', Component: Slide14LongestMessage },
  { id: 's18_longest_streak', title: 'Longest Streak', Component: Slide15LongestStreak },
  { id: 's19_longest_silence', title: 'Longest Silence', Component: Slide16LongestSilence },
  { id: 's20_achievements', title: 'Achievements', Component: Slide19Achievements },
  { id: 's21_final', title: 'Final Slide', Component: Slide20End },
  { id: 's22_credits', title: 'Credits', Component: Slide21Credits }
]

type SlidesViewProps = {
  report: unknown
  period: PeriodKey
  onPeriodToggle: () => void
  onOpenDetails: () => void
  onOpenPeople: () => void
  theme: ThemeId
  onThemeChange: (t: ThemeId) => void
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const pad2 = (n: number) => String(n).padStart(2, '0')

function getInitialSlideIndex(): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('tgwr_slide')
    if (!raw) return 0
    return clamp(Number(raw), 0, slides.length - 1)
  } catch {
    return 0
  }
}

export default function SlidesView({
  report, period, onPeriodToggle, onOpenDetails, onOpenPeople, theme, onThemeChange
}: SlidesViewProps): JSX.Element {
  const parsed = useMemo(() => asReport(report), [report])
  const year = getYearLabel(report)
  const periodLabel = period === 'all_time' ? 'ALL' : year

  const [index, setIndex] = useState(() => getInitialSlideIndex())
  const [direction, setDirection] = useState<1 | -1>(1)
  const [exportState, setExportState] = useState<ExportState | null>(null)
  const [exportSlideIndex, setExportSlideIndex] = useState<number | null>(null)
  const [scale, setScale] = useState(0.36)

  const stageRef = useRef<HTMLDivElement>(null)
  const exportStageRef = useRef<HTMLDivElement>(null)
  const lastWheelAtRef = useRef(0)
  const exportRunningRef = useRef(false)

  const exporting = exportState?.running ?? false
  const screenshotMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('tgwr_screenshot') === '1'
    } catch {
      return false
    }
  }, [])
  const captureMode = exporting || screenshotMode

  const go = useCallback((delta: number) => {
    if (exporting) return
    setDirection(delta >= 0 ? 1 : -1)
    setIndex((prev) => clamp(prev + delta, 0, slides.length - 1))
  }, [exporting])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (exporting) return
      const key = e.key
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(key)) {
        e.preventDefault(); go(1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(key)) {
        e.preventDefault(); go(-1)
      } else if (key === 'Home') {
        e.preventDefault(); setIndex(0); setDirection(-1)
      } else if (key === 'End') {
        e.preventDefault(); setIndex(slides.length - 1); setDirection(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, exporting])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (exporting) return
      const now = Date.now()
      if (now - lastWheelAtRef.current < 520) return
      if (Math.abs(e.deltaY) < 22) return
      lastWheelAtRef.current = now
      go(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [go, exporting])

  useLayoutEffect(() => {
    const update = () => {
      const desktopControlsRail = window.innerWidth >= 768 ? 220 : 0
      const mobileControlsBar = window.innerWidth < 768 ? 96 : 0
      const availableW = Math.max(320, window.innerWidth - desktopControlsRail - 32)
      const availableH = Math.max(320, window.innerHeight - mobileControlsBar - 32)
      const s = Math.min(availableW / SLIDE_W, availableH / SLIDE_H)
      setScale(clamp(s, 0.12, 0.92))
    }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const runExportTask = useCallback(async (kind: ExportKind) => {
    if (exporting || exportRunningRef.current) return
    exportRunningRef.current = true
    const dir = await window.tgwr.pickOutputDir()
    if (!dir) {
      exportRunningRef.current = false
      return
    }

    setExportState({ running: true, kind, current: 0, total: slides.length, message: 'Starting...', outputDir: dir })

    try {
      const pdf = kind === 'pdf' ? await PDFDocument.create() : null

      for (let i = 0; i < slides.length; i++) {
        setExportState(prev => prev ? { ...prev, current: i, message: `Rendering slide ${i + 1}...` } : null)
        setExportSlideIndex(i)
        await nextFrame(); await nextFrame(); await sleep(520)

        const exportNode = exportStageRef.current
        if (!exportNode) throw new Error('Export stage is not ready')
        const bytes = await capturePngBytes(exportNode, { width: SLIDE_W, height: SLIDE_H, backgroundColor: '#05070a' })

        if (pdf) {
          const img = await pdf.embedPng(bytes)
          pdf.addPage([SLIDE_W, SLIDE_H]).drawImage(img, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H })
        } else {
          await writeOutputFile(dir, `slide_${pad2(i + 1)}.png`, bytes)
        }
        setExportState(prev => prev ? { ...prev, current: i + 1 } : null)
      }

      if (pdf) {
        setExportState(prev => prev ? { ...prev, message: 'Saving PDF...' } : null)
        await writeOutputFile(dir, 'tgwr_wrapped.pdf', await pdf.save())
      }

      setExportState(prev => prev ? { ...prev, running: false, message: `Done! Check: ${dir}` } : null)
      setTimeout(() => setExportState(null), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setExportState(prev => prev ? { ...prev, running: false, error: message } : null)
    } finally {
      exportRunningRef.current = false
      setExportSlideIndex(null)
    }
  }, [exporting])

  const ActiveSlide = slides[index].Component
  const ExportSlide = exportSlideIndex !== null ? slides[exportSlideIndex].Component : null

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[var(--tgwr-bg-0)]"
      data-tgwr-slide-index={index}
      data-tgwr-slide-total={slides.length}
    >
      {/* Screenshot-only HUD. Regular viewing keeps these counters inside the controls rail. */}
      {screenshotMode ? (
        <div className="pointer-events-none absolute left-6 top-6 z-20 flex gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/70">
            {index + 1} / {slides.length}
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/70">
            {periodLabel}
          </div>
        </div>
      ) : null}

      {/* Основная сцена */}
      <div className="flex h-full w-full items-center justify-center pb-[96px] md:pl-[208px] md:pb-0">
        <motion.div
          ref={stageRef}
          style={{ width: SLIDE_W, height: SLIDE_H, scale, transformOrigin: 'center' }}
          className="relative rounded-[32px] border border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.22)] shadow-[0_24px_110px_rgba(0,0,0,0.42)]"
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={index}
              data-tgwr-active-slide={index}
              custom={direction}
              initial={captureMode ? { opacity: 1, y: 0 } : { opacity: 0, y: direction > 0 ? 100 : -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={captureMode ? { opacity: 1, y: 0 } : { opacity: 0, y: direction > 0 ? -100 : 100 }}
              transition={{ duration: captureMode ? 0 : 0.4, ease: "easeOut" }}
              className="h-full w-full"
            >
              <ActiveSlide {...{ report: parsed, period, onPeriodToggle, theme, onThemeChange, exporting: captureMode }} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Desktop controls */}
      {!captureMode && (
        <div className="fixed bottom-5 left-4 right-4 z-[100] flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.88)] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl md:bottom-auto md:left-6 md:right-auto md:top-1/2 md:w-[156px] md:-translate-y-1/2 md:flex-col md:items-stretch md:justify-start md:px-4">

          <div className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.66)] md:block">
            TGWR by IWS
          </div>

          <div className="flex items-center justify-center gap-2 md:grid md:grid-cols-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center text-[12px] font-bold text-white/80">
              {index + 1}/{slides.length}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center text-[12px] font-bold text-white/80">
              {periodLabel}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 md:justify-between">
            <motion.button
              type="button"
              onClick={() => go(-1)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
              aria-label="Предыдущий слайд"
            >
              ↑
            </motion.button>
            <motion.button
              type="button"
              onClick={() => go(1)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
              aria-label="Следующий слайд"
            >
              ↓
            </motion.button>
          </div>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <motion.button
            type="button"
            onClick={onOpenDetails}
            whileHover={{ scale: 1.035 }}
            whileTap={{ scale: 0.965 }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Детали
          </motion.button>

          <motion.button
            type="button"
            onClick={onOpenPeople}
            whileHover={{ scale: 1.035 }}
            whileTap={{ scale: 0.965 }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Люди
          </motion.button>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <div className="flex items-center justify-center gap-2 md:grid md:grid-cols-1">
            {(['neon', 'cyber', 'midnight'] as ThemeId[]).map((t) => (
              <motion.button
                key={t}
                type="button"
                onClick={() => onThemeChange(t)}
                whileHover={{ scale: 1.035 }}
                whileTap={{ scale: 0.965 }}
                className={[
                  'rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-normal transition',
                  theme === t ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                ].join(' ')}
              >
                {t === 'neon' ? 'blue' : t === 'cyber' ? 'aqua' : 'premium'}
              </motion.button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-white/20 md:h-[1px] md:w-full" />

          <div className="flex items-center justify-center gap-3 md:grid md:grid-cols-2">
            <motion.button
              type="button"
              onClick={() => runExportTask('png')}
              whileHover={{ scale: 1.035 }}
              whileTap={{ scale: 0.965 }}
              className="rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.13)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.22)]"
            >
              PNG
            </motion.button>
            <motion.button
              type="button"
              onClick={() => runExportTask('pdf')}
              whileHover={{ scale: 1.035 }}
              whileTap={{ scale: 0.965 }}
              className="rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.13)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200 transition hover:bg-[rgba(var(--tgwr-accent2-rgb),0.22)]"
            >
              PDF
            </motion.button>
          </div>
        </div>
      )}

      {/* Скрытая сцена для экспорта */}
      {ExportSlide && (
        <div className="fixed left-[-4000px] top-0">
          <div ref={exportStageRef} style={{ width: SLIDE_W, height: SLIDE_H }} className="bg-[#05070a]">
            <ExportSlide {...{ report: parsed, period, onPeriodToggle, theme, onThemeChange, exporting: true }} />
          </div>
        </div>
      )}

      {/* Прогресс экспорта */}
      {exportState && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[200] bg-black/80 p-4 rounded-2xl border border-white/10 w-80 shadow-2xl backdrop-blur-md">
          <div className="text-[13px] font-bold tracking-widest text-white/50 mb-1">{exportState.kind.toUpperCase()} EXPORT</div>
          <div className="text-sm font-semibold text-white mb-3">
            {exportState.error ?? exportState.message}
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(exportState.current/exportState.total)*100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
