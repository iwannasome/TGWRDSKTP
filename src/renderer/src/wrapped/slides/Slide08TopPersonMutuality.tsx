import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatPercent01 } from '../format'
import { getPeriod, getPersonName, getTop10, pickFirst } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber } from '../safe'

export default function Slide08TopPersonMutuality({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const arr = getTop10(p, 'top_10_people_by_mutuality')
  const top = pickFirst(arr)

  const name = getPersonName(top)
  const total = top ? getNumber(top, 'total_messages', 0) : 0
  const diff = top ? getNumber(top, 'abs_diff', 0) : 0
  const ratio = top ? getNumber(top, 'imbalance_ratio', 0) : 0
  const symmetry = top ? getNumber(top, 'symmetry_percent', Math.max(0, 100 - ratio * 100)) : 0
  const activeDays = top ? getNumber(top, 'active_days', 0) : 0
  const minimum = top ? getNumber(top, 'minimum_messages_required', 2000) : 2000

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Самая взаимная переписка</span>}
      subtitle="В общении все поровну."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          // При экспорте отключаем анимацию "взлета"
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          // Убираем задержку для мгновенного рендера в файл
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100">{name}</div>

          <div className="mt-6 grid grid-cols-3 gap-6">
            <div className="tgwr-info-card rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="text-[13px] font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Всего сообщений
              </div>
              <div className="mt-2 text-[28px] font-bold text-slate-50">
                <AnimatedNumber value={total} exporting={exporting} duration={0.76} delay={0.16} />
              </div>
            </div>

            <div className="tgwr-info-card rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="text-[13px] font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Разница реплик
              </div>
              <div className="mt-2 text-[28px] font-bold text-slate-50">
                <AnimatedNumber value={diff} exporting={exporting} duration={0.76} delay={0.22} />
              </div>
            </div>

            <div className="tgwr-info-card rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="text-[13px] font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Перекос диалога
              </div>
              <div className="mt-2 text-[28px] font-bold">
                <AnimatedNumber value={ratio} exporting={exporting} duration={0.7} delay={0.28} format={formatPercent01} className="tgwr-gradient-text" />
              </div>
            </div>
          </div>

          {arr.length === 0 ? (
            <div className="mt-8 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Пусто: этот рейтинг требует хотя бы 2000 сообщений с человеком и корректного is_out.
            </div>
          ) : (
            <div className="mt-8 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Чем меньше процент — тем ровнее диалог.
            </div>
          )}

          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">близко к 50/50</div>
              <div className="mt-2 text-[24px] font-bold text-slate-50">
                <AnimatedNumber value={Math.round(symmetry)} exporting={exporting} duration={0.62} delay={0.34} />%
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">разница реплик</div>
              <div className="mt-2 text-[24px] font-bold text-slate-50">
                <AnimatedNumber value={diff} exporting={exporting} duration={0.62} delay={0.38} />
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">минимум сообщений</div>
              <div className="mt-2 text-[24px] font-bold text-slate-50">
                <AnimatedNumber value={minimum} exporting={exporting} duration={0.62} delay={0.42} />
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">активных дней</div>
              <div className="mt-2 text-[24px] font-bold text-slate-50">
                <AnimatedNumber value={activeDays} exporting={exporting} duration={0.62} delay={0.46} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
