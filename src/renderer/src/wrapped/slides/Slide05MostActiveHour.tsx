import { motion } from 'framer-motion'
import React, { useMemo } from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatHour, formatInt } from '../format'
import { getHourlyActivity, getMostActiveHour, getPeriod, getTotalMessages } from '../report'
import type { SlideCommonProps } from '../slideTypes'

function readMetricNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dayPart(hour: number): 'night' | 'morning' | 'day' | 'evening' {
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'day'
  return 'evening'
}

function dayPartLabel(part: ReturnType<typeof dayPart>): string {
  switch (part) {
    case 'night':
      return 'ночь'
    case 'morning':
      return 'утро'
    case 'day':
      return 'день'
    case 'evening':
      return 'вечер'
  }
}

export default function Slide05MostActiveHour({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const periodMetrics = p as Record<string, unknown>

  const mostActiveHour = getMostActiveHour(p)
  const hourlyActivity = getHourlyActivity(p)
  const totalMessages = getTotalMessages(p)

  const peakHourRaw = Number(mostActiveHour?.value ?? 0)
  const peakHour = Number.isFinite(peakHourRaw) ? Math.max(0, Math.min(23, Math.floor(peakHourRaw))) : 0
  const peakCount = mostActiveHour?.count ?? 0
  const periodHours = Math.max(0, Math.round(readMetricNumber(periodMetrics, 'period_hours') ?? 0))
  const averagePerHour = Math.max(
    0,
    Math.round(
      readMetricNumber(periodMetrics, 'average_messages_per_hour') ??
        (periodHours > 0 ? totalMessages / periodHours : 0)
    )
  )

  const chart = useMemo(() => {
    const values = hourlyActivity.map((item) => item.count)
    const maxValue = Math.max(...values, 1)
    const viewWidth = 1180
    const viewHeight = 610
    const chartLeft = 42
    const chartRight = 42
    const chartTop = 50
    const chartBottom = 56
    const chartWidth = viewWidth - chartLeft - chartRight
    const chartHeight = viewHeight - chartTop - chartBottom
    const slotWidth = chartWidth / 24
    const barWidth = Math.min(30, Math.max(18, slotWidth - 14))
    const baselineY = chartTop + chartHeight
    const averageY = baselineY - (Math.min(averagePerHour, maxValue) / maxValue) * (chartHeight - 26)

    return {
      viewWidth,
      viewHeight,
      chartLeft,
      chartTop,
      chartRight,
      chartBottom,
      chartWidth,
      chartHeight,
      slotWidth,
      barWidth,
      baselineY,
      maxValue,
      averageY
    }
  }, [hourlyActivity, averagePerHour])

  const zones = [
    { start: 0, end: 6, label: 'ночь', fill: 'rgba(99,102,241,0.10)' },
    { start: 6, end: 12, label: 'утро', fill: 'rgba(56,189,248,0.08)' },
    { start: 12, end: 18, label: 'день', fill: 'rgba(163,230,53,0.07)' },
    { start: 18, end: 24, label: 'вечер', fill: 'rgba(217,70,239,0.09)' }
  ]

  const peakPart = dayPart(peakHour)

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Час-пик</span>}
      subtitle="Твои сутки как неоновый skyline: где день взлетает выше всего."
    >
      <div className="grid h-full min-h-0 grid-cols-[390px_minmax(0,1fr)] gap-7">
        <div className="flex min-h-0 flex-col gap-5">
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.04 }}
            className="relative min-h-0 flex-1 overflow-hidden rounded-[34px] border border-[rgba(var(--tgwr-accent1-rgb),0.24)] bg-[linear-gradient(145deg,rgba(var(--tgwr-accent1-rgb),0.15),rgba(var(--tgwr-card-rgb),0.74)_56%,rgba(var(--tgwr-accent2-rgb),0.14))] p-7 shadow-[0_26px_80px_rgba(0,0,0,0.30)]"
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[rgba(var(--tgwr-accent2-rgb),0.20)] blur-[64px]" />
            <div className="relative flex h-full flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                самый активный час
              </div>
              <div className="mt-5 text-[92px] font-bold leading-none">
                <span className="tgwr-gradient-text">{formatHour(peakHour)}</span>
              </div>
              <div className="mt-5 inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                {dayPartLabel(peakPart)}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-3 pt-7">
                <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    в этот час
                  </div>
                  <div className="mt-2 text-[30px] font-bold text-slate-50">
                    <AnimatedNumber
                      value={peakCount}
                      exporting={exporting}
                      duration={0.76}
                      delay={0.28}
                    />
                  </div>
                  <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">сообщений</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
                    среднее
                  </div>
                  <div className="mt-2 text-[30px] font-bold text-slate-50">
                    <AnimatedNumber
                      value={averagePerHour}
                      exporting={exporting}
                      duration={0.76}
                      delay={0.34}
                    />
                  </div>
                  <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">за час</div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.1 }}
            className="rounded-[28px] border border-white/10 bg-white/5 p-5"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.74)]">
              период
            </div>
            <div className="mt-3 text-[18px] font-semibold text-slate-100">
              <AnimatedNumber
                value={totalMessages}
                exporting={exporting}
                duration={0.85}
                delay={0.22}
              />{' '}
              сообщений
            </div>
            <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.84)]">
              {periodHours > 0 ? `${formatInt(periodHours)} часов в выбранном периоде` : 'почасовой профиль выбранного периода'}
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.30em] text-[rgba(var(--tgwr-muted-rgb),0.76)]">
                24-hour skyline
              </div>
              <div className="mt-2 text-[22px] font-semibold text-slate-100">Башни активности за сутки</div>
            </div>
            <div className="rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-4 py-2 text-[12px] font-semibold text-slate-100">
              peak · {formatHour(peakHour)}
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(var(--tgwr-card-rgb),0.44),rgba(var(--tgwr-card-rgb),0.18))] p-4">
            <svg
              viewBox={`0 0 ${chart.viewWidth} ${chart.viewHeight}`}
              className="h-full w-full"
              role="img"
              aria-label="Hourly activity skyline"
            >
              <defs>
                <linearGradient id="tgwr-hour-peak" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(var(--tgwr-accent2-rgb),1)" />
                  <stop offset="100%" stopColor="rgba(var(--tgwr-accent1-rgb),0.95)" />
                </linearGradient>
                <linearGradient id="tgwr-hour-regular" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(var(--tgwr-border-rgb),0.82)" />
                  <stop offset="100%" stopColor="rgba(var(--tgwr-border-rgb),0.30)" />
                </linearGradient>
              </defs>

              {zones.map((zone) => {
                const x = chart.chartLeft + zone.start * chart.slotWidth
                const width = (zone.end - zone.start) * chart.slotWidth
                return (
                  <g key={zone.label}>
                    <rect
                      x={x}
                      y={chart.chartTop - 44}
                      width={width}
                      height={chart.chartHeight + 44}
                      rx="24"
                      fill={zone.fill}
                    />
                    <text
                      x={x + width / 2}
                      y={chart.chartTop - 18}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="800"
                      letterSpacing="3"
                      fill="rgba(var(--tgwr-muted-rgb),0.58)"
                    >
                      {zone.label.toUpperCase()}
                    </text>
                  </g>
                )
              })}

              {[0.25, 0.5, 0.75].map((ratio) => {
                const y = chart.chartTop + chart.chartHeight * (1 - ratio)
                return (
                  <line
                    key={ratio}
                    x1={chart.chartLeft}
                    x2={chart.chartLeft + chart.chartWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(var(--tgwr-border-rgb),0.13)"
                    strokeWidth="1"
                    strokeDasharray="8 12"
                  />
                )
              })}

              <line
                x1={chart.chartLeft}
                x2={chart.chartLeft + chart.chartWidth}
                y1={chart.averageY}
                y2={chart.averageY}
                stroke="rgba(var(--tgwr-accent1-rgb),0.44)"
                strokeWidth="2"
                strokeDasharray="12 9"
              />

              {hourlyActivity.map((item, index) => {
                const ratio = chart.maxValue > 0 ? item.count / chart.maxValue : 0
                const height = Math.max(18, ratio * (chart.chartHeight - 26))
                const x = chart.chartLeft + chart.slotWidth * index + (chart.slotWidth - chart.barWidth) / 2
                const y = chart.baselineY - height
                const isPeak = index === peakHour

                return (
                  <g key={item.hour}>
                    {isPeak ? (
                      <rect
                        x={x - 12}
                        y={chart.chartTop - 34}
                        width={chart.barWidth + 24}
                        height={chart.chartHeight + 44}
                        rx="18"
                        fill="rgba(var(--tgwr-accent2-rgb),0.08)"
                        stroke="rgba(var(--tgwr-accent2-rgb),0.18)"
                      />
                    ) : null}
                    <motion.rect
                      x={x}
                      y={exporting ? y : chart.baselineY}
                      width={chart.barWidth}
                      height={exporting ? height : 0}
                      rx={chart.barWidth / 2}
                      fill={isPeak ? 'url(#tgwr-hour-peak)' : 'url(#tgwr-hour-regular)'}
                      opacity={item.count > 0 ? 1 : 0.38}
                      animate={{ y, height }}
                      whileHover={
                        !exporting
                          ? {
                              opacity: 1,
                              scaleY: 1.045,
                              filter: 'drop-shadow(0 0 12px rgba(var(--tgwr-accent2-rgb),0.58))'
                            }
                          : undefined
                      }
                      transition={{
                        duration: exporting ? 0 : 0.46,
                        delay: exporting ? 0 : 0.18 + index * 0.018,
                        ease: [0.18, 0.86, 0.32, 1]
                      }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
                    />
                    <title>{`${formatHour(item.hour)} · ${formatInt(item.count)} сообщений`}</title>
                    <text
                      x={x + chart.barWidth / 2}
                      y={chart.baselineY + 28}
                      textAnchor="middle"
                      fontSize={isPeak || index % 3 === 0 ? '13' : '0'}
                      fontWeight={isPeak ? '900' : '700'}
                      fill={isPeak ? 'rgba(var(--tgwr-accent1-rgb),0.95)' : 'rgba(var(--tgwr-muted-rgb),0.68)'}
                    >
                      {String(item.hour).padStart(2, '0')}
                    </text>
                    {isPeak ? (
                      <>
                        <motion.rect
                          x={Math.max(chart.chartLeft, Math.min(chart.chartLeft + chart.chartWidth - 118, x + chart.barWidth / 2 - 59))}
                          y={Math.max(10, y - 48)}
                          width="118"
                          height="34"
                          rx="17"
                          fill="rgba(var(--tgwr-accent2-rgb),0.14)"
                          stroke="rgba(var(--tgwr-accent2-rgb),0.28)"
                          initial={exporting ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: exporting ? 0 : 0.28, delay: exporting ? 0 : 0.72 }}
                        />
                        <text
                          x={Math.max(chart.chartLeft, Math.min(chart.chartLeft + chart.chartWidth - 118, x + chart.barWidth / 2 - 59)) + 59}
                          y={Math.max(10, y - 26)}
                          textAnchor="middle"
                          fontSize="14"
                          fontWeight="900"
                          fill="rgba(255,255,255,0.94)"
                        >
                          {formatInt(item.count)}
                        </text>
                      </>
                    ) : null}
                  </g>
                )
              })}
            </svg>
          </div>
        </motion.div>
      </div>
    </SlideFrame>
  )
}
