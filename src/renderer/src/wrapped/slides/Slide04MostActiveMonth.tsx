import { motion } from 'framer-motion'
import React, { useMemo } from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatDateYYYYMMDD, formatInt, formatMonth } from '../format'
import { getActiveDaysCount, getDailyActivity, getMostActiveDay, getMostActiveMonth, getPeriod } from '../report'
import type { DailyActivityPoint } from '../report'
import type { SlideCommonProps } from '../slideTypes'

const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

type CalendarDay = {
  date: string
  day: number
  month: number
  count: number
}

type MonthRow = {
  month: number
  label: string
  days: CalendarDay[]
  total: number
  activeDays: number
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

function inferYear(monthValue: string, dailyActivity: DailyActivityPoint[]): number {
  const monthMatch = /^([0-9]{4})-/.exec(monthValue)
  if (monthMatch) return Number(monthMatch[1])
  for (const item of dailyActivity) {
    const parsed = parseDate(item.date)
    if (parsed) return parsed.year
  }
  return new Date().getFullYear()
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildMonthRows(dailyActivity: DailyActivityPoint[], activeMonthValue: string): MonthRow[] {
  const year = inferYear(activeMonthValue, dailyActivity)
  const counts = new Map<string, number>()

  for (const item of dailyActivity) {
    const parsed = parseDate(item.date)
    if (!parsed || parsed.year !== year) continue
    counts.set(`${parsed.month}-${parsed.day}`, item.count)
  }

  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1
    const days = Array.from({ length: daysInMonth(year, month) }, (_, dayIdx) => {
      const day = dayIdx + 1
      const count = counts.get(`${month}-${day}`) ?? 0
      return {
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        month,
        count
      }
    })

    return {
      month,
      label: MONTH_NAMES[idx] ?? String(month),
      days,
      total: days.reduce((acc, day) => acc + day.count, 0),
      activeDays: days.filter((day) => day.count > 0).length
    }
  })
}

function buildBuckets(rows: MonthRow[]): number[] {
  const nonZero = rows
    .flatMap((row) => row.days.map((day) => day.count))
    .filter((value) => value > 0)
    .sort((a, b) => a - b)

  if (nonZero.length === 0) return []

  const pick = (ratio: number): number => {
    const index = Math.min(nonZero.length - 1, Math.floor((nonZero.length - 1) * ratio))
    return nonZero[index]
  }

  return [pick(0.22), pick(0.44), pick(0.66), pick(0.86)]
}

function heatLevel(value: number, buckets: number[]): number {
  if (value <= 0) return 0
  if (buckets.length === 0) return 1
  if (value <= buckets[0]) return 1
  if (value <= buckets[1]) return 2
  if (value <= buckets[2]) return 3
  if (value <= buckets[3]) return 4
  return 5
}

function heatFill(level: number): string {
  switch (level) {
    case 1:
      return 'rgba(var(--tgwr-accent1-rgb),0.18)'
    case 2:
      return 'rgba(var(--tgwr-accent1-rgb),0.34)'
    case 3:
      return 'rgba(var(--tgwr-accent1-rgb),0.58)'
    case 4:
      return 'rgba(var(--tgwr-accent2-rgb),0.74)'
    case 5:
      return 'rgba(var(--tgwr-accent2-rgb),0.96)'
    default:
      return 'rgba(var(--tgwr-border-rgb),0.12)'
  }
}

export default function Slide04MostActiveMonth({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const month = getMostActiveMonth(p)
  const peakDay = getMostActiveDay(p)
  const activeDays = getActiveDaysCount(p)
  const dailyActivity = getDailyActivity(p)

  const activeMonthNumber = Number(/^([0-9]{4})-([0-9]{2})$/.exec(month?.value ?? '')?.[2] ?? 0)
  const rows = useMemo(() => buildMonthRows(dailyActivity, month?.value ?? ''), [dailyActivity, month?.value])
  const buckets = useMemo(() => buildBuckets(rows), [rows])
  const legend = [0, 1, 2, 3, 4, 5]

  const maxMonthTotal = Math.max(...rows.map((row) => row.total), 1)

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Самый активный месяц</span>}
      subtitle="Год как карта: каждый день оставляет свой след."
    >
      <div className="grid h-full min-h-0 grid-cols-[430px_minmax(0,1fr)] gap-7">
        <div className="flex min-h-0 flex-col gap-5">
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.04 }}
            className="relative min-h-0 flex-1 overflow-hidden rounded-[34px] border border-[rgba(var(--tgwr-accent1-rgb),0.24)] bg-[linear-gradient(145deg,rgba(var(--tgwr-accent1-rgb),0.16),rgba(var(--tgwr-card-rgb),0.72)_56%,rgba(var(--tgwr-accent2-rgb),0.14))] p-7 shadow-[0_26px_80px_rgba(0,0,0,0.30)]"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.18)] blur-[58px]" />
            <div className="relative flex h-full flex-col">
              <div className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                максимум за месяц
              </div>
              <div className="mt-5 text-[86px] font-bold leading-none">
                <AnimatedNumber
                  value={month?.count ?? 0}
                  exporting={exporting}
                  duration={0.95}
                  delay={0.14}
                  className="tgwr-gradient-text"
                />
              </div>
              <div className="mt-4 text-[34px] font-semibold leading-tight text-slate-100">
                {month ? formatMonth(month.value) : 'Нет данных'}
              </div>
              <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                <div className="tgwr-info-card rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    активных дней
                  </div>
                  <div className="mt-2 text-[28px] font-bold text-slate-50">
                    <AnimatedNumber
                      value={activeDays}
                      exporting={exporting}
                      duration={0.72}
                      delay={0.3}
                    />
                  </div>
                </div>
                <div className="tgwr-info-card rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    пик дня
                  </div>
                  <div className="mt-2 text-[28px] font-bold text-slate-50">
                    {peakDay?.value ? formatDateYYYYMMDD(peakDay.value).slice(0, 5) : '—'}
                  </div>
                  <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">
                    {peakDay ? (
                      <>
                        <AnimatedNumber
                          value={peakDay.count}
                          exporting={exporting}
                          duration={0.72}
                          delay={0.36}
                        />{' '}
                        сообщений
                      </>
                    ) : (
                      'нет данных'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.1 }}
            className="tgwr-info-card rounded-[28px] border border-white/10 bg-white/5 p-5"
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.74)]">
              интенсивность
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.68)]">low</span>
              {legend.map((level) => (
                <div
                  key={level}
                  className="h-5 w-5 rounded-[7px] border border-white/10"
                  style={{ background: heatFill(level) }}
                />
              ))}
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.68)]">high</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: exporting ? 0 : 0.38, delay: exporting ? 0 : 0.14 }}
          className="flex min-h-0 flex-col rounded-[38px] border border-white/10 bg-[rgba(var(--tgwr-card-rgb),0.54)] p-7 shadow-[0_20px_80px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-[22px] font-semibold text-slate-100">12 месяцев активности</div>
            </div>
            <div className="rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-4 py-2 text-[13px] font-semibold text-slate-100">
              подсветка · {month ? formatMonth(month.value) : '—'}
            </div>
          </div>

          <div className="mt-6 grid min-h-0 flex-1 grid-rows-12 gap-2.5">
            {rows.map((row) => {
              const active = row.month === activeMonthNumber
              return (
                <div
                  key={row.month}
                  className={[
                    'grid min-h-0 grid-cols-[54px_minmax(0,1fr)_88px] items-center gap-3 rounded-[18px] border px-3 py-2',
                    active
                      ? 'border-[rgba(var(--tgwr-accent2-rgb),0.34)] bg-[rgba(var(--tgwr-accent2-rgb),0.11)] shadow-[0_0_26px_rgba(var(--tgwr-accent2-rgb),0.10)]'
                      : 'border-white/10 bg-black/[0.12]'
                  ].join(' ')}
                >
                  <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                    {row.label}
                  </div>
                  <div className="grid min-w-0 grid-cols-[repeat(31,minmax(0,1fr))] gap-1.5">
                    {Array.from({ length: 31 }, (_, dayIndex) => {
                      const day = row.days[dayIndex]
                      const level = day ? heatLevel(day.count, buckets) : 0
                      return (
                        <div
                          key={dayIndex}
                          className="group relative aspect-square"
                        >
                          <div
                            className={[
                              'tgwr-heat-cell h-full w-full rounded-[5px] border border-white/[0.04]',
                              day ? 'cursor-default' : 'opacity-0',
                              day && !exporting ? 'tgwr-heat-cell-animate' : ''
                            ].join(' ')}
                            style={{
                              background: day ? heatFill(level) : 'transparent',
                              animationDelay: day && !exporting ? `${0.18 + row.month * 0.018 + dayIndex * 0.004}s` : undefined
                            }}
                          />
                          {day && !exporting ? (
                            <div className="tgwr-mini-tooltip">
                              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
                                {formatDateYYYYMMDD(day.date)}
                              </div>
                              <div className="mt-1 text-[14px] font-bold text-slate-50">
                                {formatInt(day.count)} сообщений
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-bold tabular-nums text-slate-100">{formatInt(row.total)}</div>
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"
                      aria-hidden="true"
                    >
                      <div
                        className={[
                          'tgwr-month-total-bar h-full rounded-full bg-[linear-gradient(90deg,rgba(var(--tgwr-accent1-rgb),0.80),rgba(var(--tgwr-accent2-rgb),0.84))]',
                          exporting ? '' : 'tgwr-month-total-bar-animate'
                        ].join(' ')}
                        style={{
                          width: `${Math.max(4, (row.total / maxMonthTotal) * 100)}%`,
                          animationDelay: exporting ? undefined : `${0.24 + row.month * 0.025}s`
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
