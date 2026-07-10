import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatSecondsHuman } from '../format'
import { getLongestSilence, getPeriod } from '../report'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide16LongestSilence({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const s = getLongestSilence(p)

  return (
    <SlideFrame
      kicker="TGWR Silence"
      title="Самая длинная пауза"
      subtitle="Среди диалогов минимум с 3 000 сообщений — чтобы случайный маленький чат не становился победителем."
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="tgwr-telegram-panel rounded-[30px] p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">{s?.chatName ?? '—'}</div>

          <div className="mt-6 text-[96px] font-bold leading-none">
            <span className="tgwr-gradient-text">
              {s ? (
                <AnimatedNumber value={s.gapSeconds} exporting={exporting} duration={0.9} delay={0.14} format={formatSecondsHuman} />
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            между двумя сообщениями
          </div>

          {s ? (
            <div className="mt-7 grid grid-cols-5 gap-4">
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">начало</div>
                <div className="mt-2 text-[13px] font-semibold leading-snug text-slate-100">{s.fromDatetime || '—'}</div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">конец</div>
                <div className="mt-2 text-[13px] font-semibold leading-snug text-slate-100">{s.toDatetime || '—'}</div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">дней тишины</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  <AnimatedNumber value={s.calendarDays} exporting={exporting} duration={0.62} delay={0.3} />
                </div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">сообщений в чате</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  <AnimatedNumber value={s.chatMessageCount} exporting={exporting} duration={0.62} delay={0.34} format={formatInt} />
                </div>
              </div>
              <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">дольше обычного</div>
                <div className="mt-2 text-[20px] font-bold text-slate-50">
                  x<AnimatedNumber value={Math.round(s.gapVsMedianRatio)} exporting={exporting} duration={0.62} delay={0.38} />
                </div>
              </div>
            </div>
          ) : null}

          {!s && (
            <div className="mt-8 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Нужен личный диалог минимум с 3 000 сообщениями.
            </div>
          )}
        </motion.div>
      </div>
    </SlideFrame>
  )
}
