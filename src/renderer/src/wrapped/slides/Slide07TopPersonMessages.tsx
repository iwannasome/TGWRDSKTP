import { motion } from 'framer-motion'
import React from 'react'
import SlideFrame from '../SlideFrame'
import { formatDateYYYYMMDD, formatInt, formatMonth, formatPercent01 } from '../format'
import { getPeriod, getPersonName, getTop10, getTotalMessages, pickFirst } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

export default function Slide07TopPersonMessages({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const arr = getTop10(p, 'top_10_people_by_messages')
  const top = pickFirst(arr)

  const name = getPersonName(top)
  const total = top ? getNumber(top, 'total_messages', 0) : 0
  const sent = top ? getNumber(top, 'sent_messages', 0) : 0
  const received = top ? getNumber(top, 'received_messages', 0) : 0
  const periodTotal = getTotalMessages(p)
  const share = periodTotal > 0 ? total / periodTotal : 0
  const peakDay = getRecord(top ?? {}, 'peak_day')
  const peakMonth = getRecord(top ?? {}, 'peak_month')
  const avgActiveDay = top ? getNumber(top, 'messages_per_active_day', 0) : 0
  const lead = top ? getNumber(top, 'lead_over_next_messages', 0) : 0
  const balance = total > 0 ? Math.abs(sent - received) / total : 0

  return (
    <SlideFrame kicker="IW$" title={<span className="tgwr-gradient-text font-semibold">Топ персона</span>} subtitle="Это твой любимец, или история давно минувших дней?">
      <div className="flex h-full flex-col justify-center">
        <motion.div
          // Отключаем "взлет" карточки при экспорте
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          // Убираем задержку, чтобы захватить финальные цифры мгновенно
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="rounded-[44px] border border-white/10 bg-white/5 p-10"
        >
          <div className="break-words text-[22px] font-semibold leading-tight text-slate-100">{name}</div>

          <div className="mt-5 text-[92px] font-bold leading-none">
            <span className="tgwr-gradient-text">{formatInt(total)}</span>
          </div>

          <div className="mt-4 text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.92)]">
            сообщений всего
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Отправлено
              </div>
              <div className="mt-2 text-[26px] font-bold text-slate-50">
                {formatInt(sent)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.38em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                Получено
              </div>
              <div className="mt-2 text-[26px] font-bold text-slate-50">
                {formatInt(received)}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">доля всех сообщений</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">{formatPercent01(share)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">в активный день</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">{formatInt(Math.round(avgActiveDay))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучший день</div>
              <div className="mt-2 text-[13px] font-semibold leading-snug text-slate-100">{formatDateYYYYMMDD(getString(peakDay ?? {}, 'date', ''))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">лучший месяц</div>
              <div className="mt-2 text-[13px] font-semibold leading-snug text-slate-100">{formatMonth(getString(peakMonth ?? {}, 'value', ''))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">отрыв от #2</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">{formatInt(lead)}</div>
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full border border-white/10 bg-black/20">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.9),rgba(var(--tgwr-accent2-rgb),0.85))]"
              style={{ width: `${Math.max(4, Math.min(100, (1 - balance) * 100))}%` }}
            />
          </div>
          <div className="mt-2 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">ровность диалога внутри топ-персоны</div>

          {!arr.length && (
            <div className="mt-6 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">
              Пока пусто: проверь self_from_id / peer_from_id в БД.
            </div>
          )}
        </motion.div>
      </div>
    </SlideFrame>
  )
}
