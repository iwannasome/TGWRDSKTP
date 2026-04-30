import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatSecondsHuman } from '../format'
import { getPeriod, getReplyChampion } from '../report'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide10IgnoredMostPerson({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const champ = getReplyChampion(p, 'who_you_ignore_most')

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Кого игнорируешь дольше всех</span>}
      subtitle="Я что у тебя не один?"
    >
      <div className="flex h-full flex-col justify-center">
        <motion.div
          // При экспорте отключаем анимацию "взлета"
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          // Убираем задержку, чтобы рендерер захватил готовый текст
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100">{champ?.name ?? '—'}</div>

          <div className="mt-6 text-[90px] font-bold leading-none">
            <span className="tgwr-gradient-text">
              {champ ? (
                <AnimatedNumber
                  value={champ.seconds}
                  exporting={exporting}
                  duration={0.86}
                  delay={0.14}
                  format={formatSecondsHuman}
                />
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            медиана ответа
          </div>

          {champ ? (
            <div className="mt-7 grid grid-cols-4 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">медленнее медианы</div>
                <div className="mt-2 text-[18px] font-bold text-slate-50">
                  <AnimatedNumber value={Math.max(0, champ.deltaVsQualifiedMedianSeconds)} exporting={exporting} duration={0.62} delay={0.28} format={formatSecondsHuman} />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">долгих ответов</div>
                <div className="mt-2 text-[22px] font-bold text-slate-50">
                  <AnimatedNumber value={champ.samples} exporting={exporting} duration={0.62} delay={0.32} />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">сообщений в чате</div>
                <div className="mt-2 text-[22px] font-bold text-slate-50">
                  <AnimatedNumber value={champ.totalMessages} exporting={exporting} duration={0.62} delay={0.36} />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">минимум для чата</div>
                <div className="mt-2 text-[22px] font-bold text-slate-50">
                  <AnimatedNumber value={champ.minimumMessagesRequired} exporting={exporting} duration={0.62} delay={0.4} />
                </div>
              </div>
            </div>
          ) : null}

          {!champ && (
            <div className="mt-8 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Если здесь пусто — скорее всего не считались ответы.
            </div>
          )}
        </motion.div>
      </div>
    </SlideFrame>
  )
}
