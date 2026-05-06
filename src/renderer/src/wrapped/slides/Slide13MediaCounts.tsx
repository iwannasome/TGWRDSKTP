import React from 'react'
import AnimatedNumber from '../AnimatedNumber'
import SlideFrame from '../SlideFrame'
import { formatInt, formatMonth, formatPercent01 } from '../format'
import { getMediaCounts, getPeriod } from '../report'
import type { SlideCommonProps } from '../slideTypes'
import { getNumber, getRecord, getString } from '../safe'

type Item = { key: string; label: string; icon: string }

const ITEMS: Item[] = [
  { key: 'photo', label: 'Фото', icon: '🖼️' },
  { key: 'video', label: 'Видео', icon: '🎬' },
  { key: 'voice', label: 'Голосовые', icon: '🎙️' },
  { key: 'sticker', label: 'Стикеры', icon: '🧩' },
  { key: 'file', label: 'Файлы', icon: '📎' },
  { key: 'other', label: 'Другое', icon: '📦' }
]

const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(ITEMS.map((item) => [item.key, item.label]))

export default function Slide13MediaCounts({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const media = getMediaCounts(p)
  const topMedia = getRecord(p, 'top_media_type')
  const mediaMonth = getRecord(p, 'most_media_month')
  const topType = getString(topMedia ?? {}, 'type', '')

  return (
    <SlideFrame kicker="IW$" title={<span className="tgwr-gradient-text font-semibold">Медиа</span>} subtitle="Покидай своих фоток" >
      <div className="flex h-full flex-col justify-center">
        <div className="rounded-[44px] border border-white/10 bg-white/5 p-10">
          {/* Сетка остается прежней, 3 колонки отлично вписываются в 1080px */}
          <div className="grid grid-cols-3 gap-6">
            {ITEMS.map((it, idx) => {
              const value = media[it.key] ?? 0
              return (
                <div
                  key={it.key}
                  data-tip={`${it.label} · ${formatInt(value)}`}
                  style={{ animationDelay: exporting ? undefined : `${Math.min(0.25, idx * 0.03)}s` }}
                  className="tgwr-info-card tgwr-hover-card rounded-3xl border border-white/10 bg-white/5 px-7 py-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="tgwr-pop-icon text-[28px]">
                      {it.icon}
                    </div>
                    <div className="text-[18px] font-bold text-slate-50">
                      <AnimatedNumber value={value} exporting={exporting} duration={0.58} delay={0.08 + idx * 0.025} />
                    </div>
                  </div>
                  <div className="mt-3 text-[14px] font-semibold uppercase tracking-[0.34em] text-[rgba(var(--tgwr-muted-rgb),0.75)]">
                    {it.label}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-7 grid grid-cols-5 gap-4">
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">медиа на 100</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={Math.round(getNumber(p, 'media_per_100_messages', 0))} exporting={exporting} duration={0.62} delay={0.34} />
              </div>
              <div className="mt-1 text-[12px] text-[rgba(var(--tgwr-muted-rgb),0.78)]">на 100 сообщений</div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">главный формат</div>
              <div className="mt-2 text-[18px] font-bold text-slate-50">{LABEL_BY_KEY[topType] ?? '—'}</div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">медийный месяц</div>
              <div className="mt-2 text-[14px] font-semibold leading-snug text-slate-100">{formatMonth(getString(mediaMonth ?? {}, 'value', ''))}</div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">доля стикеров</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={getNumber(p, 'sticker_ratio', 0)} exporting={exporting} duration={0.62} delay={0.38} format={formatPercent01} />
              </div>
            </div>
            <div className="tgwr-info-card rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(var(--tgwr-muted-rgb),0.72)]">только медиа</div>
              <div className="mt-2 text-[20px] font-bold text-slate-50">
                <AnimatedNumber value={getNumber(p, 'media_only_messages', 0)} exporting={exporting} duration={0.62} delay={0.42} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
