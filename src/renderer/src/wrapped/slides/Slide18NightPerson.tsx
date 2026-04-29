import { motion } from 'framer-motion'
import React from 'react'
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
      kicker="IW$"
      title="Ночной человек"
      subtitle="Твои ночные моменты останутся при тебе, а я лишь покажу с кем их было больше всего."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100">{person?.name ?? '—'}</div>

          <div className="mt-6 text-[92px] font-bold leading-none">
            <span className="tgwr-gradient-text">
              {person ? formatInt(person.messages) : '—'}
            </span>
          </div>

          <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            сообщений ночью
          </div>

          {person ? (
            <div className="mt-7 grid grid-cols-5 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучший час</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">{formatHour(getNumber(person.nightPeakHour ?? {}, 'hour', 0))}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">доля ночью</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">{formatPercent01(person.nightRatio)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">после полуночи</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">{formatInt(person.postMidnightMessages)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучшая ночь</div>
                <div className="mt-2 text-[13px] font-semibold leading-snug text-slate-100">{formatDateYYYYMMDD(getString(person.nightPeakDate ?? {}, 'date', ''))}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">ночной индекс</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">{formatInt(person.nightBondScore)}</div>
              </div>
            </div>
          ) : null}

          {!person && (
            <div className="mt-8 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Пока не определено.
            </div>
          )}
        </motion.div>
      </div>
    </SlideFrame>
  )
}
