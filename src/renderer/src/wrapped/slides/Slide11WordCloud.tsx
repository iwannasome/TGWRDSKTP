import React, { useMemo } from 'react'
import SlideFrame from '../SlideFrame'
import { clamp } from '../format'
import { getPeriod, getWordCloud } from '../report'
import type { SlideCommonProps } from '../slideTypes'

export default function Slide11WordCloud({ report, period, exporting }: SlideCommonProps): JSX.Element {
  const p = getPeriod(report, period)
  const words = useMemo(() => getWordCloud(p).slice(0, 50), [p])

  const { minW, maxW } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const w of words) {
      min = Math.min(min, w.weight)
      max = Math.max(max, w.weight)
    }
    if (!Number.isFinite(min)) min = 0
    return { minW: min, maxW: max }
  }, [words])

  const sizeFor = (word: string, weight: number): number => {
    if (maxW <= minW) return 30
    const t = (weight - minW) / (maxW - minW)
    const base = clamp(18 + t * 54, 18, 72)
    const compactCap = word.length > 44 ? 40 : word.length > 28 ? 50 : 72
    return Math.min(base, compactCap)
  }

  return (
    <SlideFrame
      kicker="IW$"
      title={<span className="tgwr-gradient-text font-semibold">Cлова года</span>}
      subtitle="Мы говорим и пишем тысячи слов в день. А что насчет взглянуть на самые популярные?"
    >
      <div className="flex h-full flex-col justify-center">
        <div className="overflow-hidden rounded-[44px] border border-white/10 bg-white/5 p-10">
          <div className="flex flex-wrap items-center justify-start gap-x-6 gap-y-4">
            {words.length === 0 ? (
              <div className="text-[16px] text-[rgba(var(--tgwr-muted-rgb),0.9)]">
                Пока пусто — нет текста в исходящих.
              </div>
            ) : (
              words.map((w, idx) => (
                <span
                  key={`${w.word}-${idx}`}
                  data-tip={`${w.word} · ${w.weight}`}
                  style={{
                    fontSize: `${sizeFor(w.word, w.weight)}px`,
                    lineHeight: 1,
                    letterSpacing: '0',
                    animationDelay: exporting ? undefined : `${Math.min(0.22, idx * 0.01)}s`,
                    maxWidth: '100%',
                    wordBreak: 'break-word'
                  }}
                  className={[
                    'tgwr-word-token max-w-full select-none whitespace-normal break-words font-semibold text-left [overflow-wrap:anywhere]',
                    idx % 5 === 0
                      ? 'text-[rgba(var(--tgwr-accent1-rgb),0.95)]'
                      : idx % 7 === 0
                        ? 'text-[rgba(var(--tgwr-accent2-rgb),0.90)]'
                        : 'text-slate-100'
                  ].join(' ')}
                >
                  {w.word}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </SlideFrame>
  )
}
