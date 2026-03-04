import { motion } from 'framer-motion'
import React from 'react'
import SlideFrame from '../SlideFrame'
import { getYearLabel } from '../report'
import type { SlideCommonProps, ThemeId } from '../slideTypes'

function ThemeChip({ id, active, onClick }: { id: ThemeId; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-4 py-2 text-sm font-semibold transition',
        active
          ? 'border-[rgba(var(--tgwr-border-rgb),0.34)] bg-white/10 text-slate-50 shadow-[0_0_22px_rgba(var(--tgwr-accent1-rgb),0.16)]'
          : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.85)] hover:bg-white/10'
      ].join(' ')}
    >
      {id}
    </button>
  )
}

export default function Slide01Cover({ report, theme, onThemeChange }: SlideCommonProps): JSX.Element {
  const year = getYearLabel(report)

  return (
    <SlideFrame
      kicker="Telegram Wrapped"
      title="TGWR"
      subtitle="Твой Telegram — в цифрах. Полностью локально. Без серверов."
      footerHint="Колесо мыши / стрелки — листать. Кнопка “Детали” — таблицы топ-10."
    >
      <div className="flex h-full flex-col justify-between">
        <div className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4"
          >
            <div className="h-3 w-3 rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.95)] shadow-[0_0_26px_rgba(var(--tgwr-accent1-rgb),0.45)]" />
            <div className="text-sm font-semibold text-slate-100">Год (MSK):</div>
            <div className="text-lg font-bold tracking-tight text-slate-50">{year}</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.16 }}
            className="mt-10"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              Theme
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <ThemeChip id="neon" active={theme === 'neon'} onClick={() => onThemeChange('neon')} />
              <ThemeChip id="cyber" active={theme === 'cyber'} onClick={() => onThemeChange('cyber')} />
              <ThemeChip id="midnight" active={theme === 'midnight'} onClick={() => onThemeChange('midnight')} />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.22 }}
          className="tgwr-float mt-12 rounded-3xl border border-white/10 bg-white/5 px-8 py-7"
        >
          <div className="text-[13px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.80)]">
            Подсказка
          </div>
          <div className="mt-3 text-[18px] leading-relaxed text-slate-100">
            Это не дашборд. Это <span className="tgwr-gradient-text font-semibold">wrapped</span> — красивый и короткий.
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
