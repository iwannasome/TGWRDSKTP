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
      <div className="flex h-full flex-col justify-center gap-8">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.04 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
            Создатель
          </div>

          <div className="mt-5 text-[18px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.9)]">
            TGWR / Telegram Wrapped
          </div>

          <div className="mt-4 text-[92px] font-bold leading-[0.92]">
            <span className="tgwr-gradient-text">iwannasome</span>
          </div>

          <div className="mt-5 max-w-[760px] text-[16px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.95)]">
            Идея, концепт, продукт, сборка всего этого хаоса в один локальный wrapped.
          </div>
        </motion.div>

        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.1 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Благодарности
              </div>
              <div className="mt-3 text-[26px] font-semibold text-slate-100">
                За помощь, идеи и поддержку
              </div>
            </div>

            <div className="text-right text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.8)]">
              special thanks
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-5">
            {THANKS.map((name, idx) => (
              <motion.div
                key={name}
                initial={exporting ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.25,
                  delay: exporting ? 0 : Math.min(0.22, 0.05 + idx * 0.03)
                }}
                className="rounded-[30px] border border-white/10 bg-black/20 px-7 py-7"
              >
                <div className="text-[12px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                  #{idx + 1}
                </div>

                <div className="mt-3 text-[28px] font-semibold leading-snug text-slate-100">
                  {name}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}