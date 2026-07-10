import React from 'react'
import {
  formatInsightConfidence,
  formatInsightNoWinnerReason,
  formatInt,
  formatPeriodHuman
} from './format'
import { getInsightDescription, getInsightEvidenceEntries, summarizeInsightEvidence } from './insightCopy'
import type { ConversationInsight, PeriodKey } from './report'

type Props = {
  insight: ConversationInsight
  period: PeriodKey
  anonymize: boolean
  hidePrivateDetails?: boolean
}

export const INSIGHT_EXPORT_W = 1080
export const INSIGHT_EXPORT_H = 1920

export default function InsightExportCard({ insight, period, anonymize, hidePrivateDetails = true }: Props): JSX.Element {
  const winner = insight.winner
  const displayName = anonymize && winner ? 'Собеседник из Telegram' : winner?.displayName
  const evidence = getInsightEvidenceEntries(insight, 8)
    .filter((entry) => !hidePrivateDetails || !/(date|datetime|snippet|text)/i.test(entry.key))
    .slice(0, 5)
  const noWinnerReason = formatInsightNoWinnerReason(insight.noWinnerReason)
  const evidenceSummary = evidence.slice(0, 3).map((entry) => `${entry.label}: ${entry.value}`).join(' · ')

  return (
    <div
      data-tgwr-insight-export-card="true"
      style={{ width: INSIGHT_EXPORT_W, height: INSIGHT_EXPORT_H }}
      className="relative overflow-hidden bg-[var(--tgwr-bg-0)] text-slate-50"
    >
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(var(--tgwr-accent1-rgb),0.22),transparent_38%),linear-gradient(340deg,rgba(var(--tgwr-accent2-rgb),0.20),transparent_42%),linear-gradient(180deg,var(--tgwr-bg-0),var(--tgwr-bg-2))]" />
      <div className="absolute inset-x-0 top-0 h-3 bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.95),rgba(var(--tgwr-accent2-rgb),0.88))]" />

      <div className="relative flex h-full flex-col px-[78px] py-[86px]">
        <div className="flex items-center justify-between gap-6">
          <div className="rounded-full border border-white/[0.12] bg-white/[0.07] px-5 py-2 text-[22px] font-bold tracking-[0.16em] text-white/80">
            TGWR by IWS
          </div>
          <div className="rounded-full border border-white/[0.12] bg-white/[0.07] px-5 py-2 text-[22px] font-semibold text-white/70">
            {formatPeriodHuman(period)}
          </div>
        </div>

        <div className="mt-24">
          <div className="text-[28px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.86)]">
            Инсайт переписки
          </div>
          <h1 className="mt-7 break-words text-[76px] font-black leading-[0.96] tracking-normal text-slate-50 [overflow-wrap:anywhere]">
            {insight.title}
          </h1>
          <p className="mt-8 break-words text-[30px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.94)] [overflow-wrap:anywhere]">
            {getInsightDescription(insight.kind)}
          </p>
        </div>

        <div className="mt-20 rounded-[42px] border border-white/[0.12] bg-white/[0.065] p-10 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          {winner ? (
            <>
              <div className="text-[24px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
                Победитель
              </div>
              <div className="mt-5 line-clamp-3 break-words text-[66px] font-black leading-[0.98] text-slate-50 [overflow-wrap:anywhere]">
                {displayName}
              </div>
              <div className="mt-8 text-[96px] font-black leading-none tgwr-gradient-text">
                {formatInt(winner.totalMessages)}
              </div>
              <div className="mt-3 text-[28px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.90)]">
                сообщений в этом диалоге
              </div>
            </>
          ) : (
            <>
              <div className="text-[54px] font-black leading-tight text-slate-50">Без победителя</div>
              <div className="mt-6 text-[30px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.92)]">{noWinnerReason}</div>
            </>
          )}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4">
          {evidence.slice(0, 4).map((entry) => (
            <div key={entry.key} className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
              <div className="break-words text-[21px] font-bold uppercase tracking-[0.12em] text-[rgba(var(--tgwr-muted-rgb),0.78)] [overflow-wrap:anywhere]">
                {entry.label}
              </div>
              <div className="mt-3 break-words text-[34px] font-black leading-tight text-slate-50 [overflow-wrap:anywhere]">{entry.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <div className="rounded-[30px] border border-white/10 bg-black/20 p-6 text-[24px] leading-relaxed text-slate-100/90">
            {winner ? (evidenceSummary || summarizeInsightEvidence(insight, 3)) : noWinnerReason}
          </div>
          <div className="mt-6 flex items-end justify-between gap-6">
            <div className="text-[22px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.82)]">
              {formatInsightConfidence(insight.confidence)} · все посчитано локально
            </div>
            <div className="text-right">
              <div className="text-[38px] font-black uppercase tracking-[0.24em] text-white/[0.42]">IWS</div>
              <div className="mt-1 text-[18px] font-semibold text-white/[0.28]">TGWR by IWS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
