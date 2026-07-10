import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatMonth } from '../format'
import { getPeriod, getTotalMessages, getYearLabel } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

export default function Slide02TotalMessages({
  report,
  period,
  onPeriodToggle,
  exporting
}: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const total = getTotalMessages(p)
  const year = getYearLabel(report)
  const avgPerDay = getNumber(p, 'avg_messages_per_active_day', 0)
  const quietestMonth = getRecord(p, 'quietest_month')

  const periodLabel = period === 'all_time' ? 'За все время' : year

  return (
    <SlideFrame
      kicker="TGWR Stats"
      title={<span className="tgwr-gradient-text font-semibold">Сколько ты переписывался</span>}
      subtitle="Главная цифра Wrapped: общий объем диалогов за выбранный период."
      footerHint={exporting ? undefined : 'Переключатель периода меняет все слайды.'}
    >
      <div className="flex h-full flex-col justify-between">
        <div>
          <div className="inline-flex select-none items-center gap-2 rounded-full border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.58)] p-1 shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              onClick={period === 'all_time' || exporting ? undefined : onPeriodToggle}
              className={[
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                period === 'all_time'
                  ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-slate-50 cursor-default'
                  : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
              ].join(' ')}
            >
              За все время
            </button>
            <button
              type="button"
              onClick={period === 'year' || exporting ? undefined : onPeriodToggle}
              className={[
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                period === 'year'
                  ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-slate-50 cursor-default'
                  : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
              ].join(' ')}
            >
              {year}
            </button>
          </div>

          <div className="mt-10">
            <div className="select-none text-[14px] font-semibold uppercase tracking-[0.42em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Всего сообщений · {periodLabel}
            </div>

            <motion.div
              initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: exporting ? 0 : 0.08 }}
              className="mt-5 text-[116px] font-bold leading-none"
            >
              <AnimatedNumber
                value={total}
                exporting={exporting}
                duration={1.05}
                delay={0.12}
                className="tgwr-gradient-text select-none"
              />
            </motion.div>

          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.36, delay: exporting ? 0 : 0.24 }}
            className="tgwr-info-card tgwr-telegram-panel rounded-[26px] px-6 py-5"
          >
            <div className="text-[13px] font-semibold uppercase tracking-[0.30em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              В активный день
            </div>
            <div className="mt-2 text-[34px] font-bold leading-none text-slate-50">
              <AnimatedNumber
                value={Math.round(avgPerDay)}
                exporting={exporting}
                duration={0.78}
                delay={0.34}
              />
            </div>
            <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">сообщений в среднем</div>
          </motion.div>
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.36, delay: exporting ? 0 : 0.3 }}
            className="tgwr-info-card tgwr-telegram-panel rounded-[26px] px-6 py-5"
          >
            <div className="text-[13px] font-semibold uppercase tracking-[0.30em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Самый тихий месяц
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-snug text-slate-100">
              {formatMonth(getString(quietestMonth ?? {}, 'value', ''))}
            </div>
            <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">
              <AnimatedNumber
                value={getNumber(quietestMonth ?? {}, 'count', 0)}
                exporting={exporting}
                duration={0.72}
                delay={0.4}
              />{' '}
              сообщений
            </div>
          </motion.div>
        </div>
      </div>
    </SlideFrame>
  )
}
