import { motion } from 'framer-motion'
import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInsightConfidence, formatInsightNoWinnerReason, formatPeriodHuman } from '../format'
import { getInsightDescription, getInsightEvidenceEntries, getInsightRationale } from '../insightCopy'
import { getConversationInsight, type ConversationInsightKind } from '../report'
import type { SlideCommonProps } from '../slideTypes'

type Props = SlideCommonProps & {
  kind: ConversationInsightKind
}

const KIND_KICKERS: Record<ConversationInsightKind, string> = {
  main_person: 'TGWR People',
  stable_dialog: 'TGWR Stability',
  comeback: 'TGWR Comeback',
  closer_dialog: 'TGWR Growth',
  faded_dialog: 'TGWR Shift',
  night_companion: 'TGWR Night',
  day_anchor: 'TGWR Day',
  alive_dialog: 'TGWR Live',
  longest_live_session: 'TGWR Session',
  reply_rhythm: 'TGWR Reply',
  mutual_dialog: 'TGWR Balance',
  contact_initiator: 'TGWR Initiative',
  silence_restarter: 'TGWR Restart',
  media_bond: 'TGWR Media'
}

export default function InsightStorySlide({ report, period, kind, exporting }: Props): JSX.Element {
  const insight = getConversationInsight(report, period, kind)
  const evidence = getInsightEvidenceEntries(insight, 5)
  const winner = insight.winner
  const candidates = insight.candidates.slice(0, 3)
  const rationale = getInsightRationale(insight)

  return (
    <SlideFrame
      kicker={`${KIND_KICKERS[kind]} · ${formatPeriodHuman(period)}`}
      title={<span className="tgwr-gradient-text font-semibold">{insight.title}</span>}
      subtitle={getInsightDescription(kind)}
      footerHint={`${formatInsightConfidence(insight.confidence)} · локальный расчет TGWR by IWS`}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_420px] gap-8">
        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.06 }}
          className="tgwr-telegram-panel flex min-w-0 flex-col justify-center rounded-[30px] p-10"
        >
          <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
            {formatInsightConfidence(insight.confidence)}
          </div>

          {winner ? (
            <>
              <div className="mt-7 break-words text-[46px] font-bold leading-[1.04] text-slate-50 [overflow-wrap:anywhere]">
                {winner.displayName}
              </div>

              <div className="mt-7 flex items-end gap-4">
                <div className="text-[96px] font-bold leading-none">
                  <AnimatedNumber value={winner.totalMessages} exporting={exporting} duration={0.9} delay={0.14} className="tgwr-gradient-text" />
                </div>
                <div className="pb-4 text-[16px] font-semibold leading-snug text-[rgba(var(--tgwr-muted-rgb),0.90)]">
                  сообщений
                  <br />в этом диалоге
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                {evidence.slice(0, 4).map((entry, idx) => (
                  <div
                    key={entry.key}
                    className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4"
                    style={{ animationDelay: `${idx * 45}ms` }}
                  >
                    <div className="break-words text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)] [overflow-wrap:anywhere]">
                      {entry.label}
                    </div>
                    <div className="mt-2 break-words text-[24px] font-bold leading-tight text-slate-50 [overflow-wrap:anywhere]">{entry.value}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[28px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-8">
              <div className="text-[34px] font-bold leading-tight text-slate-50">Здесь честнее не выбирать победителя</div>
              <div className="mt-4 text-[18px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                {formatInsightNoWinnerReason(insight.noWinnerReason)}
              </div>
            </div>
          )}
        </motion.div>

        <motion.aside
          initial={exporting ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: exporting ? 0 : 0.14 }}
          className="flex min-h-0 min-w-0 flex-col justify-center gap-5"
        >
          <div className="tgwr-telegram-panel rounded-[26px] p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Почему этот результат
            </div>
            {winner ? (
              <ul className="mt-4 space-y-3">
                {rationale.map((line, index) => (
                  <li key={`${insight.kind}-${index}`} className="flex gap-3 break-words text-[15px] leading-relaxed text-slate-100/90 [overflow-wrap:anywhere]">
                    <span className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--tgwr-accent1-rgb))]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 break-words text-[16px] leading-relaxed text-slate-100/90 [overflow-wrap:anywhere]">
                {formatInsightNoWinnerReason(insight.noWinnerReason)}
              </div>
            )}
          </div>

          <div className="tgwr-telegram-panel rounded-[26px] p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
              Топ кандидатов
            </div>
            {candidates.length === 0 ? (
              <div className="mt-4 text-[15px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.86)]">
                Кандидаты не прошли пороги качества.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {candidates.map((candidate, idx) => (
                  <div key={`${candidate.peerFromId}-${idx}`} className="rounded-[18px] border border-white/10 bg-white/[0.045] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="line-clamp-2 break-words text-[16px] font-bold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                          {candidate.displayName}
                        </div>
                        <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                          прошёл пороги качества
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-bold text-slate-200">
                        #{idx + 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.aside>
      </div>
    </SlideFrame>
  )
}
