import React, { useEffect, useMemo, useRef, useState } from 'react'
import InsightExportCard, { INSIGHT_EXPORT_H, INSIGHT_EXPORT_W } from './InsightExportCard'
import { capturePngBytes, writePngWithPickedDirectory } from './export'
import {
  clamp,
  ellipsize,
  formatDateYYYYMMDD,
  formatHour,
  formatInt,
  formatInsightConfidence,
  formatInsightNoWinnerReason,
  formatMonth,
  formatPeriodHuman,
  formatPercent01,
  formatSecondsHuman
} from './format'
import {
  getInsightDescription,
  getInsightEvidenceEntries,
  getInsightPeerRole,
  summarizeInsightEvidence
} from './insightCopy'
import {
  CONVERSATION_INSIGHT_KEYS,
  getConversationInsights,
  getPeopleAnalytics,
  getYearLabel,
  type ConversationInsight,
  type ConversationInsightKind,
  type PersonAnalytics,
  type PersonPeriodAnalytics,
  type PeriodKey
} from './report'

type Props = {
  report: unknown
  period: PeriodKey
  onClose: () => void
  onOpenDetails: () => void
  onPeriodToggle: () => void
}

const mediaLabels: Record<string, string> = {
  photo: 'Фото',
  video: 'Видео',
  voice: 'Голосовые',
  sticker: 'Стикеры',
  gif: 'GIF',
  file: 'Файлы',
  other: 'Другое'
}

function periodData(person: PersonAnalytics, period: PeriodKey): PersonPeriodAnalytics | null {
  return person.periods[period] ?? person.periods.all_time ?? person.periods.year ?? null
}

function PeriodTabs({ period, year, onToggle }: { period: PeriodKey; year: string; onToggle: () => void }): JSX.Element {
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[rgba(var(--tgwr-border-rgb),0.16)] bg-[rgba(var(--tgwr-card-rgb),0.58)] p-1">
      <button
        type="button"
        onClick={period === 'all_time' ? undefined : onToggle}
        className={[
          'rounded-full px-4 py-2 text-sm font-semibold transition',
          period === 'all_time'
            ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-slate-50'
            : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
        ].join(' ')}
      >
        Весь архив
      </button>
      <button
        type="button"
        onClick={period === 'year' ? undefined : onToggle}
        className={[
          'rounded-full px-4 py-2 text-sm font-semibold transition',
          period === 'year'
            ? 'bg-[rgba(var(--tgwr-accent1-rgb),0.18)] text-slate-50'
            : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
        ].join(' ')}
      >
        {year}
      </button>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
      <div className="break-words text-[13px] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--tgwr-muted-rgb),0.72)] [overflow-wrap:anywhere]">
        {label}
      </div>
      <div className="mt-2 break-words text-[24px] font-bold leading-tight text-slate-100 [overflow-wrap:anywhere]">{value}</div>
      {hint ? <div className="mt-1 break-words text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.82)] [overflow-wrap:anywhere]">{hint}</div> : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="tgwr-telegram-panel min-w-0 overflow-hidden rounded-[24px] p-5">
      <div className="break-words text-[18px] font-semibold text-slate-100 [overflow-wrap:anywhere]">{title}</div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function EmptyBlock({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="break-words rounded-[18px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.86)] [overflow-wrap:anywhere]">
      {children}
    </div>
  )
}

function ConfidenceBadge({ insight }: { insight: ConversationInsight }): JSX.Element {
  return <span className="tgwr-confidence-badge">{formatInsightConfidence(insight.confidence)}</span>
}

function InsightTile({
  insight,
  period,
  active,
  onSelect
}: {
  insight: ConversationInsight
  period: PeriodKey
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const emptyText = formatInsightNoWinnerReason(insight.noWinnerReason)
  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={active ? 'true' : 'false'}
      data-empty={insight.winner ? 'false' : 'true'}
      className="tgwr-insight-card min-h-[156px] w-full p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-[15px] font-bold leading-snug text-slate-100 [overflow-wrap:anywhere]">{insight.title}</div>
          <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[rgba(var(--tgwr-muted-rgb),0.70)]">
            {formatPeriodHuman(period).replace('за ', '')}
          </div>
        </div>
        <ConfidenceBadge insight={insight} />
      </div>

      <div className="mt-4 break-words text-[16px] font-semibold leading-snug text-slate-50 [overflow-wrap:anywhere]">
        {insight.winner?.displayName ?? 'Нет честного победителя'}
      </div>
      <div className="mt-2 line-clamp-2 break-words text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.82)] [overflow-wrap:anywhere]">
        {insight.winner ? summarizeInsightEvidence(insight, 2) : emptyText}
      </div>
    </button>
  )
}

function InsightDetailPanel({
  insight,
  period,
  anonymizeExport,
  hidePrivateDetails,
  exportStatus,
  exporting,
  onAnonymizeExportChange,
  onHidePrivateDetailsChange,
  onExport,
  onSelectPeer
}: {
  insight: ConversationInsight
  period: PeriodKey
  anonymizeExport: boolean
  hidePrivateDetails: boolean
  exportStatus: string
  exporting: boolean
  onAnonymizeExportChange: (value: boolean) => void
  onHidePrivateDetailsChange: (value: boolean) => void
  onExport: () => void
  onSelectPeer: (peerFromId: string) => void
}): JSX.Element {
  const evidence = getInsightEvidenceEntries(insight, 8)
  const emptyText = formatInsightNoWinnerReason(insight.noWinnerReason)

  return (
    <section className="tgwr-telegram-panel min-w-0 overflow-hidden rounded-[24px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)] [overflow-wrap:anywhere]">
            Разбор {formatPeriodHuman(period)}
          </div>
          <div className="mt-2 break-words text-[24px] font-bold leading-tight text-slate-100 [overflow-wrap:anywhere]">{insight.title}</div>
        </div>
        <ConfidenceBadge insight={insight} />
      </div>

      <div className="mt-4 break-words text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.88)] [overflow-wrap:anywhere]">
        {getInsightDescription(insight.kind)}
      </div>

      {insight.winner ? (
        <div className="mt-5 rounded-[20px] border border-[rgba(var(--tgwr-accent1-rgb),0.22)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.74)]">Победитель</div>
          <div className="mt-2 break-words text-[24px] font-bold leading-tight text-slate-50 [overflow-wrap:anywhere]">{insight.winner.displayName}</div>
          <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
            {formatInt(insight.winner.totalMessages)} сообщений в выбранном периоде
          </div>
          <button
            type="button"
            onClick={() => onSelectPeer(insight.winner?.peerFromId ?? '')}
            className="mt-4 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.12]"
          >
            Открыть профиль
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4 text-[14px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.88)]">
          {emptyText}
        </div>
      )}

      <div className="mt-5">
        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">Доказательства</div>
        {evidence.length === 0 ? (
          <EmptyBlock>Нет числовых доказательств для этого слота.</EmptyBlock>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {evidence.map((entry) => (
              <div key={entry.key} className="tgwr-evidence-row">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{entry.label}</span>
                <span className="shrink-0 text-right font-semibold text-slate-100">{entry.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-[20px] border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-accent1-rgb),0.08)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-0 cursor-pointer items-center gap-3 text-[13px] font-semibold text-slate-100">
            <input
              type="checkbox"
              checked={anonymizeExport}
              onChange={(event) => onAnonymizeExportChange(event.currentTarget.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            <span className="break-words [overflow-wrap:anywhere]">Скрыть имя в PNG</span>
          </label>
          <label className="flex min-w-0 cursor-pointer items-center gap-3 text-[13px] font-semibold text-slate-100">
            <input
              type="checkbox"
              checked={hidePrivateDetails}
              onChange={(event) => onHidePrivateDetailsChange(event.currentTarget.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            <span className="break-words [overflow-wrap:anywhere]">Скрыть точные даты</span>
          </label>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.26)] bg-[rgba(var(--tgwr-accent1-rgb),0.16)] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.24)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? 'Экспорт...' : 'Экспорт инсайта'}
          </button>
        </div>
        {exportStatus ? (
          <div className="mt-3 break-words text-[13px] leading-relaxed text-[rgba(var(--tgwr-muted-rgb),0.86)] [overflow-wrap:anywhere]">
            {exportStatus}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">Кандидаты</div>
        {insight.candidates.length === 0 ? (
          <EmptyBlock>Кандидаты не прошли пороги или отчет создан старой версией.</EmptyBlock>
        ) : (
          <div className="space-y-2">
            {insight.candidates.slice(0, 4).map((candidate, idx) => (
              <button
                key={`${candidate.peerFromId}-${idx}`}
                type="button"
                onClick={() => onSelectPeer(candidate.peerFromId)}
                className="w-full rounded-[16px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.34)] p-3 text-left transition hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-bold text-slate-100 [overflow-wrap:anywhere]">{candidate.displayName}</div>
                    <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                      {summarizeInsightEvidence({ ...insight, evidence: candidate.evidence }, 2)}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] font-bold text-slate-200">
                    #{idx + 1}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default function PeopleView({ report, period, onClose, onOpenDetails, onPeriodToggle }: Props): JSX.Element {
  const year = getYearLabel(report)
  const people = useMemo(() => getPeopleAnalytics(report), [report])
  const insights = useMemo(() => getConversationInsights(report, period), [report, period])
  const insightList = useMemo(() => CONVERSATION_INSIGHT_KEYS.map((kind) => insights[kind]), [insights])
  const [query, setQuery] = useState('')
  const [selectedPeer, setSelectedPeer] = useState('')
  const [selectedInsightKind, setSelectedInsightKind] = useState<ConversationInsightKind>('main_person')
  const [anonymizeInsightExport, setAnonymizeInsightExport] = useState(true)
  const [hidePrivateInsightDetails, setHidePrivateInsightDetails] = useState(true)
  const [exportingInsight, setExportingInsight] = useState(false)
  const [insightExportStatus, setInsightExportStatus] = useState('')
  const insightExportRef = useRef<HTMLDivElement>(null)

  const visiblePeople = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((person) => {
        if (!q) return true
        return `${person.displayName} ${person.peerFromId}`.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const aData = periodData(a, period)
        const bData = periodData(b, period)
        return (bData?.totalMessages ?? 0) - (aData?.totalMessages ?? 0)
      })
  }, [people, period, query])

  useEffect(() => {
    if (visiblePeople.length === 0) {
      setSelectedPeer('')
      return
    }
    if (!visiblePeople.some((person) => person.peerFromId === selectedPeer)) {
      setSelectedPeer(visiblePeople[0].peerFromId)
    }
  }, [selectedPeer, visiblePeople])

  useEffect(() => {
    setInsightExportStatus('')
  }, [period, selectedInsightKind])

  const selectedPerson = visiblePeople.find((person) => person.peerFromId === selectedPeer) ?? visiblePeople[0] ?? null
  const selected = selectedPerson ? periodData(selectedPerson, period) : null
  const selectedInsight = insights[selectedInsightKind]
  const relatedInsights = selected
    ? insightList
        .map((insight) => ({ insight, role: getInsightPeerRole(insight, selected.peerFromId) }))
        .filter((item): item is { insight: ConversationInsight; role: string } => item.role !== null)
    : []

  const monthBars = useMemo(() => {
    if (!selected) return []
    return selected.monthActivity.slice(-12)
  }, [selected])

  const maxMonth = Math.max(1, ...monthBars.map((item) => item.count))
  const maxHour = Math.max(1, ...(selected?.hourlyActivity ?? []).map((item) => item.count))
  const balanceSent = selected ? clamp(selected.sentRatio * 100, 0, 100) : 0
  const balanceReceived = selected ? clamp(selected.receivedRatio * 100, 0, 100) : 0
  const mediaEntries = selected
    ? Object.entries(selected.mediaCounts).filter(([, count]) => count > 0)
    : []
  const maxMedia = Math.max(1, ...mediaEntries.map(([, count]) => count))

  const exportSelectedInsight = async (): Promise<void> => {
    if (exportingInsight) return
    const node = insightExportRef.current
    if (!node) {
      setInsightExportStatus('Карточка экспорта еще не готова.')
      return
    }

    setExportingInsight(true)
    setInsightExportStatus('Готовлю PNG...')
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bytes = await capturePngBytes(node, {
        width: INSIGHT_EXPORT_W,
        height: INSIGHT_EXPORT_H,
        backgroundColor: '#05070a'
      })
      const filename = `tgwr_by_iws_${period}_${selectedInsight.kind}.png`
      const outPath = await writePngWithPickedDirectory(filename, bytes)
      setInsightExportStatus(outPath ? `Сохранено: ${outPath}` : 'Экспорт отменен.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setInsightExportStatus(`Не удалось экспортировать: ${message}`)
    } finally {
      setExportingInsight(false)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-start justify-between gap-5 border-b border-[rgba(var(--tgwr-border-rgb),0.14)] bg-[rgba(var(--tgwr-bg-0),0.86)] px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.8)]">
                TGWR by IWS Explore
              </div>
              <div className="mt-2 text-[28px] font-bold leading-tight text-slate-100 sm:text-[32px]">Люди</div>
              <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                {formatInt(people.length)} диалогов в отчете, отсортировано по активности
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <PeriodTabs period={period} year={year} onToggle={onPeriodToggle} />
              <button
                type="button"
                onClick={onOpenDetails}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Таблицы
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.24)] bg-[rgba(var(--tgwr-accent1-rgb),0.13)] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.20)]"
              >
                Назад
              </button>
            </div>
          </div>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <div className="tgwr-telegram-panel min-w-0 overflow-hidden rounded-[24px] p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    Сигналы переписки
                  </div>
                  <div className="mt-2 break-words text-[24px] font-bold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                    14 выводов по переписке
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                  {formatPeriodHuman(period)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {insightList.map((insight) => (
                  <InsightTile
                    key={insight.kind}
                    insight={insight}
                    period={period}
                    active={insight.kind === selectedInsightKind}
                    onSelect={() => setSelectedInsightKind(insight.kind)}
                  />
                ))}
              </div>
            </div>

            <InsightDetailPanel
              insight={selectedInsight}
              period={period}
              anonymizeExport={anonymizeInsightExport}
              hidePrivateDetails={hidePrivateInsightDetails}
              exportStatus={insightExportStatus}
              exporting={exportingInsight}
              onAnonymizeExportChange={setAnonymizeInsightExport}
              onHidePrivateDetailsChange={setHidePrivateInsightDetails}
              onExport={exportSelectedInsight}
              onSelectPeer={(peerFromId) => {
                if (!peerFromId) return
                setQuery('')
                setSelectedPeer(peerFromId)
              }}
            />
          </section>

          <div className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="tgwr-telegram-panel min-h-0 rounded-[24px] p-4 xl:sticky xl:top-[116px] xl:max-h-[calc(100vh-140px)]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск"
                className="w-full rounded-full border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.54)] px-4 py-2.5 text-sm font-semibold text-slate-100 outline-none transition placeholder:text-[rgba(var(--tgwr-muted-rgb),0.55)] focus:border-[rgba(var(--tgwr-accent1-rgb),0.45)]"
              />

              <div className="mt-4 max-h-[calc(100vh-220px)] space-y-2 overflow-auto pr-1">
                {visiblePeople.length === 0 ? (
                  <EmptyBlock>Ничего не найдено.</EmptyBlock>
                ) : (
                  visiblePeople.map((person, idx) => {
                    const p = periodData(person, period)
                    const active = person.peerFromId === selectedPerson?.peerFromId
                    return (
                      <button
                        key={person.peerFromId || idx}
                        type="button"
                        onClick={() => setSelectedPeer(person.peerFromId)}
                        className={[
                          'w-full rounded-xl border p-3 text-left transition',
                          active
                            ? 'border-[rgba(var(--tgwr-accent1-rgb),0.34)] bg-[rgba(var(--tgwr-accent1-rgb),0.12)]'
                            : 'border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.34)] hover:bg-white/[0.06]'
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-100">{person.displayName || person.peerFromId}</div>
                            <div className="mt-1 truncate font-mono text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.64)]">
                              {person.peerFromId || '—'}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] font-bold text-slate-200">
                            #{idx + 1}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">
                          <span className="min-w-0 truncate tabular-nums">{formatInt(p?.totalMessages ?? 0)}</span>
                          <span className="shrink-0 tabular-nums">{p ? formatPercent01(p.sentRatio) : '—'} отправлено</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </aside>

            <main className="min-w-0">
              {!selected ? (
                <EmptyBlock>В отчете нет данных по людям.</EmptyBlock>
              ) : (
                <div className="grid gap-5">
                  <section className="tgwr-telegram-panel rounded-[24px] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      <div className="min-w-0">
                        <div className="break-words text-[30px] font-bold leading-tight text-slate-100 [overflow-wrap:anywhere]">
                          {selected.displayName}
                        </div>
                        <div className="mt-2 break-all font-mono text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.74)]">
                          {selected.peerFromId}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100">
                        {period === 'year' ? year : 'Весь архив'}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard label="Сообщения" value={formatInt(selected.totalMessages)} hint={`${formatInt(selected.activeDays)} активных дней`} />
                      <MetricCard label="Ты / собеседник" value={`${formatPercent01(selected.sentRatio)} / ${formatPercent01(selected.receivedRatio)}`} hint={`${formatInt(selected.sentMessages)} / ${formatInt(selected.receivedMessages)}`} />
                      <MetricCard label="Ответы" value={formatSecondsHuman(selected.yourMedianReplySeconds)} hint={`${formatInt(selected.yourReplySamples)} замеров твоих ответов`} />
                      <MetricCard label="Период" value={formatInt(selected.timeSpanDays || selected.activeDays)} hint={`${formatDateYYYYMMDD(selected.firstDate)} — ${formatDateYYYYMMDD(selected.lastDate)}`} />
                    </div>

                    <div className="mt-5 overflow-hidden rounded-[18px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)]">
                      <div className="flex h-3 w-full">
                        <div className="bg-[rgba(var(--tgwr-accent1-rgb),0.82)]" style={{ width: `${balanceSent}%` }} />
                        <div className="bg-[rgba(var(--tgwr-accent2-rgb),0.72)]" style={{ width: `${balanceReceived}%` }} />
                      </div>
                      <div className="flex flex-wrap justify-between gap-3 px-4 py-3 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.86)]">
                        <span className="min-w-0 break-words tabular-nums [overflow-wrap:anywhere]">отправлено · {formatInt(selected.sentMessages)}</span>
                        <span className="min-w-0 break-words tabular-nums [overflow-wrap:anywhere]">получено · {formatInt(selected.receivedMessages)}</span>
                        <span className="min-w-0 break-words tabular-nums [overflow-wrap:anywhere]">разница · {formatInt(selected.mutualityAbsDiff)}</span>
                      </div>
                    </div>

                    {relatedInsights.length > 0 ? (
                      <div className="mt-5 rounded-[18px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.40)] p-4">
                        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                          Роли в инсайтах
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {relatedInsights.map(({ insight, role }) => (
                            <button
                              key={`${insight.kind}-${role}`}
                              type="button"
                              onClick={() => setSelectedInsightKind(insight.kind)}
                              className="max-w-full rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.22)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-3 py-1.5 text-left text-[13px] font-semibold text-slate-100 transition hover:bg-[rgba(var(--tgwr-accent1-rgb),0.16)]"
                            >
                              <span className="break-words [overflow-wrap:anywhere]">{insight.title}</span>
                              <span className="ml-2 text-[rgba(var(--tgwr-muted-rgb),0.78)]">{role}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <Panel title="Динамика по месяцам">
                      {monthBars.length === 0 ? (
                        <EmptyBlock>Нет помесячной детализации.</EmptyBlock>
                      ) : (
                        <div className="flex h-60 items-end gap-2">
                          {monthBars.map((item) => (
                            <div key={item.value} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                              <div className="w-full rounded-t-lg bg-[linear-gradient(180deg,rgba(var(--tgwr-accent1-rgb),0.78),rgba(var(--tgwr-accent2-rgb),0.42))]" style={{ height: `${Math.max(8, (item.count / maxMonth) * 190)}px` }} />
                              <div className="max-w-full truncate text-[12px] font-semibold text-[rgba(var(--tgwr-muted-rgb),0.74)]">
                                {formatMonth(item.value).split(' ')[0].slice(0, 3)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>

                    <Panel title="Активность по часам">
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                        {selected.hourlyActivity.map((item) => {
                          const opacity = clamp(item.count / maxHour, 0.08, 1)
                          return (
                            <div
                              key={item.hour}
                              className="min-h-[56px] min-w-0 rounded-xl border border-white/10 px-2 py-2 text-center"
                              style={{ background: `rgba(var(--tgwr-accent1-rgb),${0.08 + opacity * 0.36})` }}
                            >
                              <div className="text-[12px] font-bold leading-none text-slate-100">{String(item.hour).padStart(2, '0')}</div>
                              <div className="mt-2 truncate text-[12px] leading-none text-[rgba(var(--tgwr-muted-rgb),0.78)] tabular-nums">{formatInt(item.count)}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 break-words text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.88)] [overflow-wrap:anywhere]">
                        Пик: {selected.peakHour ? `${formatHour(selected.peakHour.hour)} · ${formatInt(selected.peakHour.count)}` : '—'}
                      </div>
                    </Panel>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-3">
                    <Panel title="Инициатива">
                      <div className="grid gap-3">
                        <MetricCard label="Дней начато тобой" value={formatInt(selected.daysStartedByYou)} />
                        <MetricCard label="Дней начато им/ей" value={formatInt(selected.daysStartedByThem)} />
                        <MetricCard label="Твоя доля" value={formatPercent01(selected.youInitiatedRatio)} hint={`${formatInt(selected.initiatedDays)} дней с первым сообщением`} />
                      </div>
                    </Panel>

                    <Panel title="Ответы">
                      <div className="grid gap-3">
                        <MetricCard label="Ты отвечаешь" value={formatSecondsHuman(selected.yourMedianReplySeconds)} hint={`${formatInt(selected.yourReplySamples)} замеров`} />
                        <MetricCard label="Тебе отвечают" value={formatSecondsHuman(selected.theirMedianReplySeconds)} hint={`${formatInt(selected.theirReplySamples)} замеров`} />
                        <MetricCard label="Ночь" value={formatPercent01(selected.nightRatio)} hint={`${formatInt(selected.nightMessages)} сообщений 00:00—05:59`} />
                      </div>
                    </Panel>

                    <Panel title="Медиа">
                      {mediaEntries.length === 0 ? (
                        <EmptyBlock>Медиа не найдено.</EmptyBlock>
                      ) : (
                        <div className="space-y-3">
                          {mediaEntries.map(([key, count]) => (
                            <div key={key}>
                              <div className="flex items-center justify-between gap-3 text-[13px] text-slate-100">
                                <span>{mediaLabels[key] ?? key}</span>
                                <span className="tabular-nums">{formatInt(count)}</span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
                                <div className="h-full rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.66)]" style={{ width: `${Math.max(5, (count / maxMedia) * 100)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <Panel title="Слова и эмодзи">
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div>
                          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                            Слова
                          </div>
                          {selected.topWords.length === 0 ? (
                            <EmptyBlock>Нет слов.</EmptyBlock>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {selected.topWords.slice(0, 16).map((item) => (
                                <span key={item.word} className="max-w-full break-words rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-semibold text-slate-100 [overflow-wrap:anywhere]">
                                  {item.word} · {formatInt(item.count)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                            Emoji
                          </div>
                          {selected.topEmojis.length === 0 ? (
                            <EmptyBlock>Нет эмодзи.</EmptyBlock>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {selected.topEmojis.slice(0, 16).map((item) => (
                                <span key={item.emoji} className="max-w-full break-words rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[18px] font-semibold text-slate-100 [overflow-wrap:anywhere]">
                                  {item.emoji} <span className="text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.8)]">{formatInt(item.count)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Panel>

                    <Panel title="Самые длинные сообщения">
                      {selected.topLongestMessages.length === 0 ? (
                        <EmptyBlock>Длинные текстовые сообщения не найдены.</EmptyBlock>
                      ) : (
                        <div className="space-y-3">
                          {selected.topLongestMessages.map((item, idx) => (
                            <div key={`${item.dateTs}-${idx}`} className="rounded-[18px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
                                <span>{item.direction === 'out' ? 'Ты' : item.direction === 'in' ? 'Собеседник' : 'Сообщение'}</span>
                                <span>{formatInt(item.lengthChars)} символов</span>
                              </div>
                              <div className="mt-2 break-words text-[14px] leading-relaxed text-slate-100/90 [overflow-wrap:anywhere]">
                                {ellipsize(item.snippet, 220)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>

                  <div className="pb-8 text-center text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    TGWR by IWS · локально на этом компьютере
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
      <div className="fixed left-[-6000px] top-0" aria-hidden="true">
        <div ref={insightExportRef} style={{ width: INSIGHT_EXPORT_W, height: INSIGHT_EXPORT_H }}>
          <InsightExportCard
            insight={selectedInsight}
            period={period}
            anonymize={anonymizeInsightExport}
            hidePrivateDetails={hidePrivateInsightDetails}
          />
        </div>
      </div>
    </div>
  )
}
