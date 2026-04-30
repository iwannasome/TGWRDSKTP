import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatDateYYYYMMDD, formatHour, formatInt, formatPercent01 } from '../format'
import { getNightRatio, getPeriod, getTotalMessages } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

export default function Slide06NightRatio({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const night = getNightRatio(p)
  const total = getTotalMessages(p)
  const peakHour = getRecord(p, 'night_peak_hour')
  const peakDate = getRecord(p, 'most_night_date')
  const sleepBoundary = getRecord(p, 'sleep_boundary_hour')
  const postMidnight = getNumber(p, 'post_midnight_messages', night.count)

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Ночные сообщения</span>}
      subtitle="Спишь?)"
    >
      <div className="flex h-full flex-col justify-center">
        <div className="grid grid-cols-2 gap-8">
          {/* Первая карточка: Процент */}
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
            className="rounded-[40px] border border-white/10 bg-white/5 p-9"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              В процентах:
            </div>
            <div className="mt-4 text-[82px] font-bold leading-none">
              <AnimatedNumber
                value={night.ratio}
                exporting={exporting}
                duration={0.86}
                delay={0.12}
                format={formatPercent01}
                className="tgwr-gradient-text"
              />
            </div>
            <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
              доля ночных сообщений
            </div>
          </motion.div>

          {/* Вторая карточка: Количество */}
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: exporting ? 0 : 0.12 }}
            className="rounded-[40px] border border-white/10 bg-white/5 p-9"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Количество:
            </div>
            <div className="mt-4 text-[76px] font-bold leading-none text-slate-50">
              <AnimatedNumber value={night.count} exporting={exporting} duration={0.86} delay={0.18} />
            </div>
            <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
              из <AnimatedNumber value={total} exporting={exporting} duration={0.72} delay={0.28} /> сообщений
            </div>
          </motion.div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Пиковый ночной час
            </div>
            <div className="mt-2 text-[28px] font-bold text-slate-50">{formatHour(getNumber(peakHour ?? {}, 'hour', 0))}</div>
            <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              <AnimatedNumber value={getNumber(peakHour ?? {}, 'count', 0)} exporting={exporting} duration={0.58} delay={0.34} /> сообщений
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              После полуночи
            </div>
            <div className="mt-2 text-[28px] font-bold text-slate-50">
              <AnimatedNumber value={postMidnight} exporting={exporting} duration={0.68} delay={0.38} />
            </div>
            <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">00:00-05:59</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Самая ночная дата
            </div>
            <div className="mt-2 text-[17px] font-semibold leading-snug text-slate-100">
              {formatDateYYYYMMDD(getString(peakDate ?? {}, 'date', ''))}
            </div>
            <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              <AnimatedNumber value={getNumber(peakDate ?? {}, 'count', 0)} exporting={exporting} duration={0.58} delay={0.42} /> сообщений
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Последний поздний час
            </div>
            <div className="mt-2 text-[28px] font-bold text-slate-50">{formatHour(getNumber(sleepBoundary ?? {}, 'hour', 0))}</div>
            <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">последний активный</div>
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
