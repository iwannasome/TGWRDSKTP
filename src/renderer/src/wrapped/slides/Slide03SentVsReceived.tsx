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
    <SlideFrame
      kicker="TGWR Dialog"
      title={<span className="tgwr-gradient-text font-semibold">Диалог в обе стороны</span>}
      subtitle="Сколько сообщений ушло от тебя и сколько вернулось обратно."
    >
      <div className="flex h-full flex-col justify-between">
        <div className="mt-7 grid grid-cols-2 gap-7">
          <div className="flex flex-col items-end">
            <div className="tgwr-bubble-out min-w-[360px] rounded-[28px] rounded-br-[10px] px-7 py-6 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.24em] text-white/75">
                Отправлено
              </div>
              <div className="mt-3 text-[54px] font-bold leading-none">
                <AnimatedNumber value={sent} exporting={exporting} duration={0.86} delay={0.14} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start">
            <div className="tgwr-bubble-in min-w-[360px] rounded-[28px] rounded-bl-[10px] border border-white/10 px-7 py-6 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.24em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                Получено
              </div>
              <div className="mt-3 text-[54px] font-bold leading-none text-slate-50">
                <AnimatedNumber value={received} exporting={exporting} duration={0.86} delay={0.2} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-9 tgwr-info-card tgwr-telegram-panel rounded-[28px] p-7">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Баланс переписки
              </div>
              <div className="mt-2 text-[18px] font-semibold text-slate-100">
                <AnimatedNumber value={sentPct} exporting={exporting} duration={0.64} delay={0.28} />% отправлено ·{' '}
                <AnimatedNumber value={100 - sentPct} exporting={exporting} duration={0.64} delay={0.3} />% получено
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Всего
              </div>
              <div className="mt-2 text-[18px] font-semibold text-slate-100">
                <AnimatedNumber value={total} exporting={exporting} duration={0.72} delay={0.32} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden rounded-full border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.62)]">
            <motion.div
              initial={exporting ? { width: `${sentPct}%` } : { width: 0 }}
              animate={{ width: `${sentPct}%` }}
              transition={{ duration: exporting ? 0 : 0.55, ease: 'easeOut' }}
              className="col-span-2 h-3 rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.88),rgba(var(--tgwr-accent2-rgb),0.74))]"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-5">
          <div className="tgwr-info-card tgwr-telegram-panel rounded-[24px] px-5 py-5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Разница
            </div>
            <div className="mt-2 text-[30px] font-bold leading-none text-slate-50">
              <AnimatedNumber value={diff} exporting={exporting} duration={0.72} delay={0.36} />
            </div>
            <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">сообщений между сторонами</div>
          </div>
          <div className="tgwr-info-card tgwr-telegram-panel rounded-[24px] px-5 py-5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Самый ровный день
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-snug text-slate-100">
              {formatDateYYYYMMDD(getString(balancedDay ?? {}, 'date', ''))}
            </div>
            <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              разница <AnimatedNumber value={getNumber(balancedDay ?? {}, 'abs_diff', 0)} exporting={exporting} duration={0.58} delay={0.42} />
            </div>
          </div>
          <div className="tgwr-info-card tgwr-telegram-panel rounded-[24px] px-5 py-5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Самый резкий день
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-snug text-slate-100">
              {formatDateYYYYMMDD(getString(oneSidedDay ?? {}, 'date', ''))}
            </div>
            <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              разница <AnimatedNumber value={getNumber(oneSidedDay ?? {}, 'abs_diff', 0)} exporting={exporting} duration={0.58} delay={0.46} />
            </div>
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
