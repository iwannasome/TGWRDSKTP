import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatDateYYYYMMDD, formatHour, formatInt, formatPercent01 } from '../format'
import { getDayNightPerson, getPeriod } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getString } from '../safe'

export default function Slide18NightPerson({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const person = getDayNightPerson(p, 'night_person')

  return (
    <SlideFrame
      kicker="TGWR Night"
      title="Ночной человек"
      subtitle="С кем чаще всего переписка продолжалась после полуночи."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="tgwr-telegram-panel rounded-[30px] p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">{person?.name ?? '—'}</div>

          <div className="mt-6 text-[92px] font-bold leading-none">
            <span className="tgwr-gradient-text">
              {person ? (
                <AnimatedNumber value={person.messages} exporting={exporting} duration={0.9} delay={0.14} />
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            сообщений ночью
          </div>

          {person ? (
            <div className="mt-7 grid grid-cols-5 gap-4">
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучший час</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">{formatHour(getNumber(person.nightPeakHour ?? {}, 'hour', 0))}</div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">доля ночью</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  <AnimatedNumber value={person.nightRatio} exporting={exporting} duration={0.62} delay={0.28} format={formatPercent01} />
                </div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">после полуночи</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  <AnimatedNumber value={person.postMidnightMessages} exporting={exporting} duration={0.62} delay={0.32} />
                </div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучшая ночь</div>
                <div className="mt-2 text-[14px] font-semibold leading-snug text-slate-100">{formatDateYYYYMMDD(getString(person.nightPeakDate ?? {}, 'date', ''))}</div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">ночной индекс</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  <AnimatedNumber value={person.nightBondScore} exporting={exporting} duration={0.62} delay={0.36} />
                </div>
              </div>
            </div>
          ) : null}

          {!person && (
            <div className="mt-8 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Пока не определено.
            </div>
          )}
        </motion.div>
      </div>
    </SlideFrame>
  )
}
