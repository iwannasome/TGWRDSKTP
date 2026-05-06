import { motion } from 'framer-motion'
import React from 'react'
import SlideFrame from '../SlideFrame'
import type { SlideCommonProps } from '../slideTypes'

const THANKS = [
  'Дима Aura Persiphall',
  'Андрей Dvunya',
  'Варвара Осеевская',
  'Павел pvllnv',
  'Артем Портнов',
  'Елизавета Романова',

]

export default function Slide21Credits({ exporting }: SlideCommonProps): JSX.Element {
  return (
    <SlideFrame
      kicker="IW$ GNOMS"
      title="Титры"
      subtitle="Люди, без которых TGWR не был бы таким."
      footerHint="Спасибо за помощь, фидбек и поддержку."
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.04 }}
          className="flex min-h-0 flex-col justify-between rounded-[34px] border border-white/10 bg-white/5 p-8"
        >
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Создатель
            </div>

            <div className="mt-5 text-[18px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.9)]">
              TGWR / Telegram Wrapped
            </div>

            <div className="mt-4 max-w-full whitespace-nowrap text-[36px] font-bold leading-[0.95]">
              <span className="tgwr-gradient-text">iwannasome</span>
            </div>
          </div>

          <div className="mt-6 max-w-[620px] text-[16px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
            Идея, концепт, продукт, сборка всего этого хаоса в один локальный wrapped.
          </div>
        </motion.div>

        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.1 }}
          className="min-h-0 rounded-[34px] border border-white/10 bg-white/5 p-8"
        >
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Благодарности
              </div>
              <div className="mt-3 text-[24px] font-semibold text-slate-100">
                За помощь, идеи и поддержку
              </div>
            </div>

            <div className="text-right text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.8)]">
              особая благодарность
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {THANKS.map((name, idx) => (
              <div
                key={name}
                data-tip={`Спасибо · #${idx + 1}`}
                style={{ animationDelay: exporting ? undefined : `${Math.min(0.22, 0.05 + idx * 0.03)}s` }}
                className="min-w-0 tgwr-info-card rounded-[24px] border border-white/10 bg-black/20 px-5 py-5"
              >
                <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                  #{idx + 1}
                </div>

                <div className="mt-2 break-words text-[22px] font-semibold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                  {name}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
