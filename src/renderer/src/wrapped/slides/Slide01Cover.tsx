import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatDateYYYYMMDD, formatInt } from '../format'
import { getPeriod, getYearLabel } from '../report'
import type { SlideCommonProps, ThemeId } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

function ThemeChip({ id, active, onClick, exporting }: { id: ThemeId; active: boolean; onClick: () => void; exporting?: boolean }): JSX.Element {
  const label: Record<ThemeId, string> = {
    neon: 'Blue',
    cyber: 'Aqua',
    midnight: 'Premium'
  }

  return (
    <button
      type="button"
      onClick={exporting ? undefined : onClick}
      className={[
        'rounded-full border px-4 py-2 text-sm font-semibold transition',
        active
          ? 'border-[rgba(var(--tgwr-border-rgb),0.34)] bg-white/10 text-slate-50 shadow-[0_0_22px_rgba(var(--tgwr-accent1-rgb),0.16)]'
          : 'border-white/10 bg-white/5 text-[rgba(var(--tgwr-muted-rgb),0.85)]',
        !active && exporting ? 'hidden' : '', // На экспорте оставляем только выбранную тему
        exporting ? 'cursor-default' : 'hover:bg-white/10'
      ].join(' ')}
    >
      {label[id]}
    </button>
  )
}

export default function Slide01Cover({ report, theme, onThemeChange, exporting }: SlideCommonProps): JSX.Element {
  const year = getYearLabel(report)
  const allTime = getPeriod(report, 'all_time')
  const span = getRecord(allTime, 'period_span')
  const firstDate = formatDateYYYYMMDD(getString(span ?? {}, 'first_date', ''))
  const lastDate = formatDateYYYYMMDD(getString(span ?? {}, 'last_date', ''))
  const chats = getNumber(allTime, 'total_chats_personal', 0)
  const activeDays = getNumber(allTime, 'active_days_count', 0)

  return (
    <SlideFrame
      kicker="TGWR Story"
      title={<span className="tgwr-gradient-text font-semibold">Telegram Wrapped</span>}
      subtitle="Локальный обзор твоих чатов: сообщения, люди, медиа и ритм переписок."
      footerHint={exporting ? undefined : 'Стрелки или колесо — листать. “Детали” — таблицы и топ-10.'}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="mt-6">
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: exporting ? 0 : 0.1 }}
            className="tgwr-telegram-panel inline-flex items-center gap-3 rounded-full px-5 py-3"
          >
            <div className="h-2.5 w-2.5 rounded-full bg-[rgba(var(--tgwr-accent1-rgb),0.95)] shadow-[0_0_18px_rgba(var(--tgwr-accent1-rgb),0.34)]" />
            <div className="text-sm font-semibold text-slate-100">MSK · {year}</div>
          </motion.div>

          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: exporting ? 0 : 0.13 }}
            className="mt-10 grid grid-cols-3 gap-4"
          >
            <div className="tgwr-info-card tgwr-telegram-panel rounded-[26px] px-5 py-5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Период
              </div>
              <div className="mt-3 text-[18px] font-semibold leading-snug text-slate-100">
                {firstDate} - {lastDate}
              </div>
            </div>
            <div className="tgwr-info-card tgwr-telegram-panel rounded-[26px] px-5 py-5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                В анализе
              </div>
              <div className="mt-3 text-[30px] font-bold leading-none text-slate-50">
                <AnimatedNumber value={chats} exporting={exporting} duration={0.7} delay={0.2} />
              </div>
              <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">личных чатов</div>
            </div>
            <div className="rounded-[26px] border border-[rgba(var(--tgwr-accent1-rgb),0.22)] bg-[rgba(var(--tgwr-accent1-rgb),0.09)] px-5 py-5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Локально
              </div>
              <div className="mt-3 text-[18px] font-semibold leading-snug text-slate-100">без облака</div>
              <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">
                <AnimatedNumber value={activeDays} exporting={exporting} duration={0.7} delay={0.24} /> активных дней
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: exporting ? 0 : 0.16 }}
            className="mt-10"
          >
            <div className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
              {exporting ? 'Активная тема' : 'Тема'}
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <ThemeChip id="neon" active={theme === 'neon'} onClick={() => onThemeChange('neon')} exporting={exporting} />
              <ThemeChip id="cyber" active={theme === 'cyber'} onClick={() => onThemeChange('cyber')} exporting={exporting} />
              <ThemeChip id="midnight" active={theme === 'midnight'} onClick={() => onThemeChange('midnight')} exporting={exporting} />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.22 }}
          className={`${exporting ? '' : 'tgwr-float'} mt-12 rounded-[30px] border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[linear-gradient(135deg,rgba(var(--tgwr-accent1-rgb),0.13),rgba(var(--tgwr-card-rgb),0.68))] px-8 py-7`}
        >
          <div className="text-[14px] font-semibold uppercase tracking-[0.26em] text-[rgba(var(--tgwr-muted-rgb),0.80)]">
            Private by default
          </div>
          <div className="mt-3 text-[18px] leading-relaxed text-slate-100">
            Все считается на этом компьютере. Чаты не загружаются в облако, а итог остается <span className="tgwr-gradient-text font-semibold">только у тебя.</span>
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
