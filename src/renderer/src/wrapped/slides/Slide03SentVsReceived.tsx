import { motion } from 'framer-motion'
import React, { useMemo } from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { clamp, formatDateYYYYMMDD, formatInt } from '../format'
import { getPeriod, getReceivedMessages, getSentMessages, getTotalMessages } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

export default function Slide03SentVsReceived({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const sent = getSentMessages(p)
  const received = getReceivedMessages(p)
  const total = getTotalMessages(p)

  const sentRatio = useMemo(() => {
    if (total <= 0) return 0
    return clamp(sent / total, 0, 1)
  }, [sent, total])

  const sentPct = Math.round(sentRatio * 100)
  const diff = Math.abs(sent - received)
  const balancedDay = getRecord(p, 'most_balanced_day')
  const oneSidedDay = getRecord(p, 'most_one_sided_day')

  return (
    <SlideFrame kicker="IW$" title={<span className="tgwr-gradient-text font-semibold">Ты или тебе?</span>} subtitle="Если я бы не писал, ты бы не писала" >
      <div className="flex h-full flex-col justify-between">
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-7 py-7">
            <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Отправлено
            </div>
            <div className="mt-3 text-[52px] font-bold leading-none text-slate-50">
              <AnimatedNumber value={sent} exporting={exporting} duration={0.86} delay={0.14} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 px-7 py-7">
            <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Получено
            </div>
            <div className="mt-3 text-[52px] font-bold leading-none text-slate-50">
              <AnimatedNumber value={received} exporting={exporting} duration={0.86} delay={0.2} />
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-7">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Баланс в процентах
              </div>
              <div className="mt-2 text-[18px] font-semibold text-slate-100">
                <AnimatedNumber value={sentPct} exporting={exporting} duration={0.64} delay={0.28} />% отправлено ·{' '}
                <AnimatedNumber value={100 - sentPct} exporting={exporting} duration={0.64} delay={0.3} />% получено
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Всего
              </div>
              <div className="mt-2 text-[18px] font-semibold text-slate-100">
                <AnimatedNumber value={total} exporting={exporting} duration={0.72} delay={0.32} />
              </div>
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
            {/* ГЛАВНОЕ ИЗМЕНЕНИЕ: Прогресс-бар
                Если идет экспорт — сразу выставляем финальную ширину.
            */}
            <motion.div
              initial={exporting ? { width: `${sentPct}%` } : { width: 0 }}
              animate={{ width: `${sentPct}%` }}
              transition={{ duration: exporting ? 0 : 0.55, ease: "easeOut" }}
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.75),rgba(var(--tgwr-accent2-rgb),0.65))] shadow-[0_0_26px_rgba(var(--tgwr-accent1-rgb),0.18)]"
            />
          </div>

          <div className="mt-4 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.80)]">

          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Перекос
            </div>
            <div className="mt-2 text-[30px] font-bold leading-none text-slate-50">
              <AnimatedNumber value={diff} exporting={exporting} duration={0.72} delay={0.36} />
            </div>
            <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">сообщений разницы</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Ровный день
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-snug text-slate-100">
              {formatDateYYYYMMDD(getString(balancedDay ?? {}, 'date', ''))}
            </div>
            <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              diff <AnimatedNumber value={getNumber(balancedDay ?? {}, 'abs_diff', 0)} exporting={exporting} duration={0.58} delay={0.42} />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Односторонний
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-snug text-slate-100">
              {formatDateYYYYMMDD(getString(oneSidedDay ?? {}, 'date', ''))}
            </div>
            <div className="mt-2 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              diff <AnimatedNumber value={getNumber(oneSidedDay ?? {}, 'abs_diff', 0)} exporting={exporting} duration={0.58} delay={0.46} />
            </div>
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
