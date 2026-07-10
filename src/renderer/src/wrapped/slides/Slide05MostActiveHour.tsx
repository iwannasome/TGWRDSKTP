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

type HourBar = {
  hour: number
  count: number
  x: number
  y: number
  height: number
  isPeak: boolean
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`
  }

  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
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
    const positiveValues = values.filter((value) => value > 0)
    const minPositiveValue = positiveValues.length > 0 ? Math.min(...positiveValues) : 0
    const compressedScale =
      positiveValues.length > 1 && maxValue > 0 && (maxValue - minPositiveValue) / maxValue < 0.28
    const viewWidth = 1180
    const viewHeight = 680
    const chartLeft = 56
    const chartRight = 56
    const chartTop = 72
    const chartBottom = 70
    const chartWidth = viewWidth - chartLeft - chartRight
    const chartHeight = viewHeight - chartTop - chartBottom
    const slotWidth = chartWidth / 24
    const barWidth = Math.min(30, Math.max(20, slotWidth - 16))
    const baselineY = chartTop + chartHeight
    const bucketAverage = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
    const valueToRatio = (value: number): number => {
      if (value <= 0) return 0
      if (!compressedScale) return Math.min(value, maxValue) / maxValue

      const localSpread = Math.max(1, maxValue - minPositiveValue)
      const localRatio = Math.max(0, Math.min(1, (value - minPositiveValue) / localSpread))
      return 0.56 + localRatio * 0.44
    }
    const averageY = baselineY - valueToRatio(bucketAverage) * (chartHeight - 26)

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
      minPositiveValue,
      compressedScale,
      averageY
    }
  }, [hourlyActivity])

  const hourBars = useMemo<HourBar[]>(() => {
    return hourlyActivity.map((item, index) => {
      const rawRatio = chart.maxValue > 0 ? item.count / chart.maxValue : 0
      const ratio =
        item.count <= 0
          ? 0
          : chart.compressedScale
            ? 0.56 +
              (Math.max(0, item.count - chart.minPositiveValue) / Math.max(1, chart.maxValue - chart.minPositiveValue)) *
                0.44
            : rawRatio
      const height = item.count > 0 ? Math.max(18, ratio * (chart.chartHeight - 26)) : 8
      const x = chart.chartLeft + chart.slotWidth * index + (chart.slotWidth - chart.barWidth) / 2
      const y = chart.baselineY - height

      return {
        hour: item.hour,
        count: item.count,
        x,
        y,
        height,
        isPeak: index === peakHour
      }
    })
  }, [chart, hourlyActivity, peakHour])

  const activityLinePath = useMemo(() => {
    return smoothPath(hourBars.map((bar) => ({ x: bar.x + chart.barWidth / 2, y: bar.y + 8 })))
  }, [chart.barWidth, hourBars])

  const zones = [
    { start: 0, end: 6, label: 'ночь', fill: 'rgba(99,102,241,0.10)' },
    { start: 6, end: 12, label: 'утро', fill: 'rgba(56,189,248,0.08)' },
    { start: 12, end: 18, label: 'день', fill: 'rgba(163,230,53,0.07)' },
    { start: 18, end: 24, label: 'вечер', fill: 'rgba(217,70,239,0.09)' }
  ]

  const peakPart = dayPart(peakHour)

  return (
    <SlideFrame
      kicker="TGWR Rhythm"
      title={<span className="tgwr-gradient-text font-semibold">Час-пик</span>}
      subtitle="В какие часы переписка чаще всего набирала скорость."
    >
      <div className="grid h-full min-h-0 grid-cols-[330px_minmax(0,1fr)] gap-5">
        <div className="flex min-h-0 flex-col gap-4">
          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.04 }}
            className="relative min-h-0 flex-1 overflow-hidden rounded-[30px] border border-[rgba(var(--tgwr-accent1-rgb),0.24)] bg-[linear-gradient(145deg,rgba(var(--tgwr-accent1-rgb),0.15),rgba(var(--tgwr-card-rgb),0.74)_56%,rgba(var(--tgwr-accent2-rgb),0.12))] p-6 shadow-[0_20px_58px_rgba(0,0,0,0.26)]"
          >
            <div className="relative flex h-full flex-col">
              <div className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.78)]">
                самый активный час
              </div>
              <div className="mt-5 text-[84px] font-bold leading-none">
                <span className="tgwr-gradient-text">{formatHour(peakHour)}</span>
              </div>
              <div className="mt-5 inline-flex w-fit rounded-full border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.46)] px-4 py-2 text-[14px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                {dayPartLabel(peakPart)}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
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
                  <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">сообщений</div>
                </div>
                <div className="tgwr-info-card rounded-[20px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">
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
                  <div className="mt-1 text-[13px] text-[rgba(var(--tgwr-muted-rgb),0.82)]">за час</div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: exporting ? 0 : 0.34, delay: exporting ? 0 : 0.1 }}
            className="tgwr-info-card rounded-[24px] border border-white/10 bg-[rgba(var(--tgwr-surface-rgb),0.42)] p-4"
          >
            <div className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[rgba(var(--tgwr-muted-rgb),0.74)]">
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
            <div className="mt-1 text-[14px] text-[rgba(var(--tgwr-muted-rgb),0.84)]">
              {periodHours > 0 ? `${formatInt(periodHours)} часов в выбранном периоде` : 'почасовой профиль выбранного периода'}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={exporting ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: exporting ? 0 : 0.38, delay: exporting ? 0 : 0.14 }}
          className="tgwr-telegram-panel flex min-h-0 flex-col rounded-[30px] p-5"
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.30em] text-[rgba(var(--tgwr-muted-rgb),0.76)]">
                24 часа
              </div>
              <div className="mt-2 text-[20px] font-semibold leading-tight text-slate-100">Активность по часам</div>
            </div>
            <div className="shrink-0 rounded-full border border-[rgba(var(--tgwr-accent1-rgb),0.18)] bg-[rgba(var(--tgwr-accent1-rgb),0.10)] px-4 py-2 text-[13px] font-semibold text-slate-100">
              пик · {formatHour(peakHour)}
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(var(--tgwr-card-rgb),0.44),rgba(var(--tgwr-card-rgb),0.18))] p-3">
            <svg
              viewBox={`0 0 ${chart.viewWidth} ${chart.viewHeight}`}
              className="h-full w-full"
              role="img"
              aria-label="Активность по часам"
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
                <linearGradient id="tgwr-hour-line" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="rgba(56,189,248,0.30)" />
                  <stop offset="52%" stopColor="rgba(var(--tgwr-accent1-rgb),0.86)" />
                  <stop offset="100%" stopColor="rgba(var(--tgwr-accent2-rgb),0.78)" />
                </linearGradient>
                <filter id="tgwr-hour-peak-glow" x="-120%" y="-80%" width="340%" height="260%">
                  <feGaussianBlur stdDeviation="9" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
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

              <g>
                <line
                  x1={chart.chartLeft}
                  x2={chart.chartLeft + chart.chartWidth}
                  y1={chart.averageY}
                  y2={chart.averageY}
                  stroke="rgba(var(--tgwr-accent1-rgb),0.30)"
                  strokeWidth="2"
                  strokeDasharray="12 9"
                />
                <line
                  x1={chart.chartLeft}
                  x2={chart.chartLeft + chart.chartWidth}
                  y1={chart.averageY}
                  y2={chart.averageY}
                  stroke="rgba(var(--tgwr-accent1-rgb),0.62)"
                  strokeWidth="2"
                  strokeDasharray="12 9"
                  strokeDashoffset={exporting ? 0 : chart.chartWidth}
                >
                  {!exporting ? (
                    <animate
                      attributeName="stroke-dashoffset"
                      from={chart.chartWidth}
                      to="0"
                      dur="0.72s"
                      begin="0.44s"
                      fill="freeze"
                      calcMode="spline"
                      keySplines="0.18 0.86 0.32 1"
                    />
                  ) : null}
                </line>
                {!exporting ? (
                  <circle
                    cx={chart.chartLeft}
                    cy={chart.averageY}
                    r="4"
                    fill="rgba(var(--tgwr-accent1-rgb),0.95)"
                    opacity="0"
                  >
                    <animate attributeName="opacity" values="0;1;0" dur="0.72s" begin="0.44s" fill="freeze" />
                    <animate
                      attributeName="cx"
                      from={chart.chartLeft}
                      to={chart.chartLeft + chart.chartWidth}
                      dur="0.72s"
                      begin="0.44s"
                      fill="freeze"
                      calcMode="spline"
                      keySplines="0.18 0.86 0.32 1"
                    />
                  </circle>
                ) : null}
              </g>

              {activityLinePath ? (
                <g pointerEvents="none">
                  <path
                    d={activityLinePath}
                    fill="none"
                    stroke="rgba(var(--tgwr-accent2-rgb),0.20)"
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#tgwr-hour-peak-glow)"
                    opacity="0.42"
                  />
                  <path
                    d={activityLinePath}
                    fill="none"
                    stroke="url(#tgwr-hour-line)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength="1"
                    strokeDasharray="1"
                    strokeDashoffset={exporting ? 0 : 1}
                  >
                    {!exporting ? (
                      <animate
                        attributeName="stroke-dashoffset"
                        from="1"
                        to="0"
                        dur="0.78s"
                        begin="0.52s"
                        fill="freeze"
                        calcMode="spline"
                        keySplines="0.18 0.86 0.32 1"
                      />
                    ) : null}
                  </path>
                </g>
              ) : null}

              {hourBars.map((bar, index) => {
                const labelWidth = bar.isPeak ? 146 : 132
                const labelX = Math.max(
                  chart.chartLeft,
                  Math.min(chart.chartLeft + chart.chartWidth - labelWidth, bar.x + chart.barWidth / 2 - labelWidth / 2)
                )
                const labelY = Math.max(10, bar.y - 58)
                const delay = 0.18 + index * 0.018
                const capY = Math.max(chart.chartTop - 10, bar.y + 7)

                return (
                  <g key={bar.hour} className="tgwr-hour-bar-group">
                    {bar.isPeak ? (
                      <rect
                        x={bar.x - 12}
                        y={chart.chartTop - 34}
                        width={chart.barWidth + 24}
                        height={chart.chartHeight + 44}
                        rx="18"
                        fill="rgba(var(--tgwr-accent2-rgb),0.08)"
                        stroke="rgba(var(--tgwr-accent2-rgb),0.18)"
                        filter="url(#tgwr-hour-peak-glow)"
                      >
                        {!exporting ? (
                          <animate
                            attributeName="opacity"
                            values="0.08;0.22;0.08"
                            dur="2.2s"
                            begin="0.86s"
                            repeatCount="indefinite"
                          />
                        ) : null}
                      </rect>
                    ) : null}
                    {bar.isPeak ? (
                      <rect
                        x={bar.x - 7}
                        y={exporting ? bar.y - 10 : chart.baselineY}
                        width={chart.barWidth + 14}
                        height={exporting ? bar.height + 20 : 0}
                        rx={(chart.barWidth + 14) / 2}
                        fill="rgba(var(--tgwr-accent2-rgb),0.14)"
                        filter="url(#tgwr-hour-peak-glow)"
                      >
                        {!exporting ? (
                          <>
                            <animate
                              attributeName="y"
                              from={chart.baselineY}
                              to={bar.y - 10}
                              dur="0.52s"
                              begin={`${delay + 0.08}s`}
                              fill="freeze"
                              calcMode="spline"
                              keySplines="0.18 0.86 0.32 1"
                            />
                            <animate
                              attributeName="height"
                              from="0"
                              to={bar.height + 20}
                              dur="0.52s"
                              begin={`${delay + 0.08}s`}
                              fill="freeze"
                              calcMode="spline"
                              keySplines="0.18 0.86 0.32 1"
                            />
                          </>
                        ) : null}
                      </rect>
                    ) : null}
                    <rect
                      className="tgwr-hour-bar"
                      x={bar.x}
                      y={exporting ? bar.y : chart.baselineY}
                      width={chart.barWidth}
                      height={exporting ? bar.height : 0}
                      rx={chart.barWidth / 2}
                      fill={bar.isPeak ? 'url(#tgwr-hour-peak)' : 'url(#tgwr-hour-regular)'}
                      opacity={bar.count > 0 ? 1 : 0.38}
                    >
                      {!exporting ? (
                        <>
                          <animate
                            attributeName="y"
                            from={chart.baselineY}
                            to={bar.y}
                            dur="0.46s"
                            begin={`${delay}s`}
                            fill="freeze"
                            calcMode="spline"
                            keySplines="0.18 0.86 0.32 1"
                          />
                          <animate
                            attributeName="height"
                            from="0"
                            to={bar.height}
                            dur="0.46s"
                            begin={`${delay}s`}
                            fill="freeze"
                            calcMode="spline"
                            keySplines="0.18 0.86 0.32 1"
                          />
                        </>
                      ) : null}
                    </rect>
                    <ellipse
                      className="tgwr-hour-bar-cap"
                      cx={bar.x + chart.barWidth / 2}
                      cy={exporting ? capY : chart.baselineY}
                      rx={Math.max(4, chart.barWidth * 0.28)}
                      ry="3.5"
                      fill="rgba(255,255,255,0.72)"
                      opacity={bar.count > 0 ? 0.32 : 0.12}
                    >
                      {!exporting ? (
                        <>
                          <animate
                            attributeName="cy"
                            from={chart.baselineY}
                            to={capY}
                            dur="0.46s"
                            begin={`${delay}s`}
                            fill="freeze"
                            calcMode="spline"
                            keySplines="0.18 0.86 0.32 1"
                          />
                          <animate
                            attributeName="opacity"
                            from="0"
                            to={bar.count > 0 ? 0.32 : 0.12}
                            dur="0.24s"
                            begin={`${delay + 0.22}s`}
                            fill="freeze"
                          />
                        </>
                      ) : null}
                    </ellipse>
                    <title>{`${formatHour(bar.hour)} · ${formatInt(bar.count)} сообщений`}</title>
                    <rect
                      className="tgwr-hour-hit"
                      x={chart.chartLeft + index * chart.slotWidth}
                      y={chart.chartTop - 44}
                      width={chart.slotWidth}
                      height={chart.chartHeight + 88}
                      fill="transparent"
                      pointerEvents="all"
                    />
                    <text
                      x={bar.x + chart.barWidth / 2}
                      y={chart.baselineY + 28}
                      textAnchor="middle"
                      fontSize={bar.isPeak || index % 3 === 0 ? '13' : '0'}
                      fontWeight={bar.isPeak ? '900' : '700'}
                      fill={bar.isPeak ? 'rgba(var(--tgwr-accent1-rgb),0.95)' : 'rgba(var(--tgwr-muted-rgb),0.68)'}
                    >
                      {String(bar.hour).padStart(2, '0')}
                    </text>
                    <g className={`tgwr-hour-hover-label${bar.isPeak ? ' tgwr-hour-hover-label-peak' : ''}`}>
                      <rect
                        x={labelX}
                        y={labelY}
                        width={labelWidth}
                        height="42"
                        rx="21"
                        fill={bar.isPeak ? 'rgba(var(--tgwr-accent2-rgb),0.18)' : 'rgba(3,7,18,0.78)'}
                        stroke={bar.isPeak ? 'rgba(var(--tgwr-accent2-rgb),0.34)' : 'rgba(255,255,255,0.15)'}
                      />
                      <text
                        x={labelX + labelWidth / 2}
                        y={labelY + 16}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="900"
                        letterSpacing="2.4"
                        fill="rgba(var(--tgwr-muted-rgb),0.80)"
                      >
                        {formatHour(bar.hour)}
                      </text>
                      <text
                        x={labelX + labelWidth / 2}
                        y={labelY + 31}
                        textAnchor="middle"
                        fontSize="13"
                        fontWeight="900"
                        fill="rgba(255,255,255,0.96)"
                      >
                        {formatInt(bar.count)} сообщений
                      </text>
                    </g>
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
