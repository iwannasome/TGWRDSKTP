import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { clamp } from './format'
import { getYearLabel, type PeriodKey } from './report'
import type { SlideCommonProps, ThemeId } from './slideTypes'

import Slide01Cover from './slides/Slide01Cover'
import Slide02TotalMessages from './slides/Slide02TotalMessages'
import Slide03SentVsReceived from './slides/Slide03SentVsReceived'
import Slide04MostActiveMonth from './slides/Slide04MostActiveMonth'
import Slide05MostActiveHour from './slides/Slide05MostActiveHour'
import Slide06NightRatio from './slides/Slide06NightRatio'
import Slide07TopPersonMessages from './slides/Slide07TopPersonMessages'
import Slide08TopPersonMutuality from './slides/Slide08TopPersonMutuality'
import Slide09FastestReplyPerson from './slides/Slide09FastestReplyPerson'
import Slide10IgnoredMostPerson from './slides/Slide10IgnoredMostPerson'
import Slide11WordCloud from './slides/Slide11WordCloud'
import Slide12EmojiTop from './slides/Slide12EmojiTop'
import Slide13MediaCounts from './slides/Slide13MediaCounts'
import Slide14LongestMessage from './slides/Slide14LongestMessage'
import Slide15LongestStreak from './slides/Slide15LongestStreak'
import Slide16LongestSilence from './slides/Slide16LongestSilence'
import Slide17DayPerson from './slides/Slide17DayPerson'
import Slide18NightPerson from './slides/Slide18NightPerson'
import Slide19Achievements from './slides/Slide19Achievements'
import Slide20End from './slides/Slide20End'

type SlideDef = {
  id: string
  Component: React.ComponentType<SlideCommonProps>
}

const SLIDE_W = 1080
const SLIDE_H = 1920

const slides: SlideDef[] = [
  { id: 's1_cover', Component: Slide01Cover },
  { id: 's2_total_messages', Component: Slide02TotalMessages },
  { id: 's3_sent_vs_received', Component: Slide03SentVsReceived },
  { id: 's4_most_active_month', Component: Slide04MostActiveMonth },
  { id: 's5_most_active_hour', Component: Slide05MostActiveHour },
  { id: 's6_night_ratio', Component: Slide06NightRatio },
  { id: 's7_top_person_messages', Component: Slide07TopPersonMessages },
  { id: 's8_top_person_mutuality', Component: Slide08TopPersonMutuality },
  { id: 's9_fastest_reply', Component: Slide09FastestReplyPerson },
  { id: 's10_ignored_most', Component: Slide10IgnoredMostPerson },
  { id: 's11_word_cloud', Component: Slide11WordCloud },
  { id: 's12_emoji_top', Component: Slide12EmojiTop },
  { id: 's13_media_counts', Component: Slide13MediaCounts },
  { id: 's14_longest_message', Component: Slide14LongestMessage },
  { id: 's15_longest_streak', Component: Slide15LongestStreak },
  { id: 's16_longest_silence', Component: Slide16LongestSilence },
  { id: 's17_day_person', Component: Slide17DayPerson },
  { id: 's18_night_person', Component: Slide18NightPerson },
  { id: 's19_achievements', Component: Slide19Achievements },
  { id: 's20_end', Component: Slide20End }
]

type Props = {
  report: unknown
  period: PeriodKey
  onPeriodToggle: () => void
  onOpenDetails: () => void
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
}

export default function SlidesView({ report, period, onPeriodToggle, onOpenDetails, theme, onThemeChange }: Props): JSX.Element {
  const [index, setIndex] = useState<number>(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [scale, setScale] = useState<number>(1)

  const year = getYearLabel(report)
  const periodLabel = period === 'all_time' ? 'ALL' : year

  const lastWheelAtRef = useRef<number>(0)

  const go = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        const next = clamp(prev + delta, 0, slides.length - 1)
        return next
      })
      setDirection(delta >= 0 ? 1 : -1)
    },
    [setIndex]
  )

  const goNext = useCallback(() => go(1), [go])
  const goPrev = useCallback(() => go(-1), [go])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key
      if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
        e.preventDefault()
        goNext()
        return
      }
      if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'PageUp') {
        e.preventDefault()
        goPrev()
        return
      }
      if (key === 'Home') {
        e.preventDefault()
        setIndex(0)
        setDirection(-1)
      }
      if (key === 'End') {
        e.preventDefault()
        setIndex(slides.length - 1)
        setDirection(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [goNext, goPrev])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const now = Date.now()
      const dt = now - lastWheelAtRef.current
      if (dt < 520) return

      const dy = e.deltaY
      if (Math.abs(dy) < 22) return

      lastWheelAtRef.current = now
      if (dy > 0) goNext()
      else goPrev()
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
    }
  }, [goNext, goPrev])

  useLayoutEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const s = Math.min((w - 32) / SLIDE_W, (h - 32) / SLIDE_H)
      setScale(clamp(s, 0.18, 1))
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const slide = slides[index]
  const ActiveSlide = slide.Component

  const motionVariants = useMemo(
    () => ({
      enter: (dir: 1 | -1) => ({
        opacity: 0,
        y: dir > 0 ? 140 : -140,
        filter: 'blur(10px)',
        scale: 0.985
      }),
      center: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        scale: 1,
        transitionEnd: { filter: 'none' }
      },
      exit: (dir: 1 | -1) => ({
        opacity: 0,
        y: dir > 0 ? -140 : 140,
        filter: 'blur(10px)',
        scale: 0.985
      })
    }),
    []
  )

  return (
    <div className="relative h-full w-full">
      {/* HUD */}
      <div className="pointer-events-none absolute left-6 top-6 z-20 flex w-[calc(100%-48px)] items-start justify-between">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            slide {index + 1}/{slides.length}
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            {periodLabel}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenDetails}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Детали
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[rgba(var(--tgwr-muted-rgb),0.9)] md:flex">
            <span className="h-2 w-2 rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.85)]" />
            {theme}
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="flex h-full w-full items-center justify-center p-6">
        <div
          style={{ width: `${SLIDE_W}px`, height: `${SLIDE_H}px`, transform: `scale(${scale})` }}
          className="origin-center"
        >
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={slide.id}
              custom={direction}
              variants={motionVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full"
            >
              <ActiveSlide
                report={report}
                period={period}
                onPeriodToggle={onPeriodToggle}
                theme={theme}
                onThemeChange={onThemeChange}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  )
}
