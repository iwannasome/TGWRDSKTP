import React, { useMemo } from 'react'
import { formatInt, formatPercent01 } from './format'
import { getPeriod, getTop10, getYearLabel, type PeriodKey } from './report'
import { asNumber, asRecord, asString, getNumber, getString } from './safe'

function formatTs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  try {
    return new Date(ts * 1000).toLocaleDateString('ru-RU')
  } catch {
    return '—'
  }
}

type Props = {
  report: unknown
  period: PeriodKey
  onClose: () => void
  onPeriodToggle: () => void
}

function PeriodTabs({ period, year, onToggle }: { period: PeriodKey; year: string; onToggle: () => void }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
      <button
        type="button"
        onClick={period === 'all_time' ? undefined : onToggle}
        className={[
          'rounded-full px-4 py-2 text-sm font-semibold transition',
          period === 'all_time'
            ? 'bg-white/10 text-slate-50'
            : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
        ].join(' ')}
      >
        All-time
      </button>
      <button
        type="button"
        onClick={period === 'year' ? undefined : onToggle}
        className={[
          'rounded-full px-4 py-2 text-sm font-semibold transition',
          period === 'year'
            ? 'bg-white/10 text-slate-50'
            : 'text-[rgba(var(--tgwr-muted-rgb),0.8)] hover:bg-white/10 hover:text-slate-100'
        ].join(' ')}
      >
        {year}
      </button>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-[34px] border border-white/10 bg-white/5 p-7">
      <div className="flex items-baseline justify-between gap-6">
        <div>
          <div className="text-[18px] font-semibold text-slate-100">{title}</div>
          {subtitle ? <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.85)]">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function Table({
  headers,
  rows
}: {
  headers: { key: string; title: string; right?: boolean }[]
  rows: Record<string, unknown>[]
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full border-collapse">
        <thead className="bg-black/30">
          <tr>
            {headers.map((h) => (
              <th
                key={h.key}
                className={[
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.8)]',
                  h.right ? 'text-right' : ''
                ].join(' ')}
              >
                {h.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.03]'}>
              {headers.map((h) => (
                <td
                  key={h.key}
                  className={[
                    'px-4 py-3 text-sm text-slate-100/90',
                    h.right ? 'text-right tabular-nums' : ''
                  ].join(' ')}
                >
                  {asString((r as Record<string, unknown>)[h.key], '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DetailsView({ report, period, onClose, onPeriodToggle }: Props): JSX.Element {
  const year = getYearLabel(report)
  const p = getPeriod(report, period)

  const topMessages = useMemo(() => getTop10(p, 'top_10_people_by_messages'), [p])
  const topSpan = useMemo(() => getTop10(p, 'top_10_people_by_time_span'), [p])
  const topMutual = useMemo(() => getTop10(p, 'top_10_people_by_mutuality'), [p])

  const rowsMessages = useMemo(() => {
    return topMessages.map((it, idx) => {
      const name = getString(it, 'display_name', '') || getString(it, 'peer_from_id', '') || '—'
      return {
        rank: String(idx + 1),
        name,
        total: formatInt(getNumber(it, 'total_messages', 0)),
        sent: formatInt(getNumber(it, 'sent_messages', 0)),
        recv: formatInt(getNumber(it, 'received_messages', 0))
      }
    })
  }, [topMessages])

  const rowsSpan = useMemo(() => {
    return topSpan.map((it, idx) => {
      const name = getString(it, 'display_name', '') || getString(it, 'peer_from_id', '') || '—'
      const firstTs = getNumber(it, 'first_ts', 0)
      const lastTs = getNumber(it, 'last_ts', 0)
      return {
        rank: String(idx + 1),
        name,
        span_days: formatInt(getNumber(it, 'span_days', 0)),
        first: formatTs(firstTs),
        last: formatTs(lastTs)
      }
    })
  }, [topSpan])

  const rowsMutual = useMemo(() => {
    return topMutual.map((it, idx) => {
      const name = getString(it, 'display_name', '') || getString(it, 'peer_from_id', '') || '—'
      const ratio = getNumber(it, 'imbalance_ratio', 0)
      return {
        rank: String(idx + 1),
        name,
        total: formatInt(getNumber(it, 'total_messages', 0)),
        abs_diff: formatInt(getNumber(it, 'abs_diff', 0)),
        imbalance: formatPercent01(ratio)
      }
    })
  }, [topMutual])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 overflow-auto px-8 py-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.42em] text-[rgba(var(--tgwr-muted-rgb),0.8)]">
                Details
              </div>
              <div className="mt-3 text-[40px] font-bold text-slate-100">Топ-10 таблицы</div>
              <div className="mt-2 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                Без фильтров. Ровно из report.json.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <PeriodTabs period={period} year={year} onToggle={onPeriodToggle} />
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Назад
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-6">
            <Card title="Top 10 · Messages" subtitle="С кем больше всего сообщений">
              {rowsMessages.length === 0 ? (
                <div className="text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">Пусто.</div>
              ) : (
                <Table
                  headers={[
                    { key: 'rank', title: '#' },
                    { key: 'name', title: 'Person' },
                    { key: 'total', title: 'Total', right: true },
                    { key: 'sent', title: 'Sent', right: true },
                    { key: 'recv', title: 'Recv', right: true }
                  ]}
                  rows={rowsMessages}
                />
              )}
            </Card>

            <Card title="Top 10 · Time span" subtitle="От первого до последнего сообщения">
              {rowsSpan.length === 0 ? (
                <div className="text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">Пусто.</div>
              ) : (
                <Table
                  headers={[
                    { key: 'rank', title: '#' },
                    { key: 'name', title: 'Person' },
                    { key: 'span_days', title: 'Days', right: true },
                    { key: 'first', title: 'First', right: true },
                    { key: 'last', title: 'Last', right: true }
                  ]}
                  rows={rowsSpan}
                />
              )}
            </Card>

            <Card title="Top 10 · Mutuality" subtitle="Минимальный дисбаланс sent/recv при большом объёме">
              {rowsMutual.length === 0 ? (
                <div className="text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">Пусто.</div>
              ) : (
                <Table
                  headers={[
                    { key: 'rank', title: '#' },
                    { key: 'name', title: 'Person' },
                    { key: 'total', title: 'Total', right: true },
                    { key: 'abs_diff', title: 'Abs diff', right: true },
                    { key: 'imbalance', title: 'Imbalance', right: true }
                  ]}
                  rows={rowsMutual}
                />
              )}
            </Card>

            <Card title="Debug" subtitle="Сырые куски отчёта (на случай странностей)">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                    self_from_id
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-100">
                    {(() => {
                      const meta = asRecord((report as Record<string, unknown> | null)?.meta) ?? {}
                      return asString(meta.self_from_id, '—') || '—'
                    })()}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                    total_messages
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-100">{formatInt(asNumber(p.total_messages, 0))}</div>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-10 pb-8 text-center text-xs text-[rgba(var(--tgwr-muted-rgb),0.75)]">
            TGWR · local only
          </div>
        </div>
      </div>
    </div>
  )
}
