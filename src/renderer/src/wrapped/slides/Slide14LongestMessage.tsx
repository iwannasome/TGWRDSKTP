import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { ellipsize, formatInt } from '../format'
import { getPeriod, getTopLongestMessages } from '../report'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide14LongestMessage({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const topMessages = getTopLongestMessages(p)

  return (
    <SlideFrame
      kicker="TGWR Text"
      title={<span className="tgwr-gradient-text font-semibold">Самые длинные сообщения</span>}
      subtitle="Топ-5 самых длинных исходящих сообщений за выбранный период."
    >
      <div className="flex h-full min-h-0 flex-col justify-center">
        <div className="flex h-full min-h-0 flex-col gap-3.5">
          {topMessages.length === 0 ? (
            <motion.div
              initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
              className="tgwr-telegram-panel rounded-[30px] p-10"
            >
              <div className="text-[20px] font-semibold text-slate-100">Пока пусто</div>
              <div className="mt-4 text-[15px] text-[rgba(var(--tgwr-muted-rgb),0.90)]">
                Нужны исходящие текстовые сообщения, чтобы собрать топ самых длинных.
              </div>
            </motion.div>
          ) : (
            topMessages.slice(0, 5).map((msg, idx) => (
              <motion.div
                key={`${msg.name}-${msg.length}-${idx}`}
                initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.30, delay: exporting ? 0 : Math.min(0.22, 0.04 + idx * 0.03) }}
                className={[
                  'group flex min-h-[104px] flex-col overflow-hidden rounded-[28px] border px-7 py-5',
                  exporting
                    ? 'flex-1'
                    : 'flex-1 transition-[flex,transform,border-color,background-color,box-shadow] duration-300 ease-out will-change-transform hover:flex-[2.65] hover:-translate-y-1',
                  idx === 0
                    ? 'border-[rgba(var(--tgwr-accent1-rgb),0.28)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] shadow-[0_0_32px_rgba(var(--tgwr-accent1-rgb),0.10)] hover:border-[rgba(var(--tgwr-accent1-rgb),0.46)] hover:shadow-[0_18px_60px_rgba(var(--tgwr-accent1-rgb),0.16)]'
                    : 'border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] hover:border-[rgba(var(--tgwr-accent2-rgb),0.30)] hover:bg-white/[0.075] hover:shadow-[0_18px_54px_rgba(0,0,0,0.28)]'
                ].join(' ')}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5">
                  <div className="flex min-w-0 items-start gap-5">
                    <div className={[
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[18px] font-bold',
                      idx === 0
                        ? 'border-[rgba(var(--tgwr-accent1-rgb),0.34)] bg-[rgba(var(--tgwr-accent1-rgb),0.14)] text-slate-50'
                        : 'border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] text-slate-100'
                    ].join(' ')}>
                      {idx + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="line-clamp-2 break-words text-[19px] font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">{msg.name}</div>
                      <div className="mt-2 text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                        Сообщение #{idx + 1}
                      </div>
                    </div>
                  </div>

                  <div className="w-[112px] shrink-0 tgwr-info-card rounded-[18px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] px-3 py-3 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                      Длина
                    </div>
                    <div className="mt-1 text-[22px] font-bold leading-none text-slate-50">
                      <AnimatedNumber value={msg.length} exporting={exporting} duration={0.58} delay={0.12 + idx * 0.03} />
                    </div>
                    <div className="text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.78)]">символов</div>
                  </div>
                </div>

                <div
                  className={[
                    'min-h-0 rounded-[24px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] px-5 transition-[margin,max-height,opacity,padding] duration-300 ease-out',
                    exporting
                      ? 'mt-4 max-h-[112px] overflow-hidden py-4 opacity-100'
                      : 'mt-0 max-h-0 overflow-hidden py-0 opacity-0 group-hover:mt-4 group-hover:max-h-[300px] group-hover:overflow-y-auto group-hover:py-4 group-hover:opacity-100'
                  ].join(' ')}
                >
                  <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[rgba(255,255,255,0.94)] [overflow-wrap:anywhere]">
                    {exporting ? ellipsize(msg.snippet, 220) : msg.snippet}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </SlideFrame>
  )
}
